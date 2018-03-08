#!/usr/bin/env node

const eppkg = require('./package.json'),
  program = require('commander'),
  moment = require('moment'),
  Table = require('cli-table'),
  lib = require('./lib'),
  { STS, ECS, CloudWatch } = require('aws-sdk');

program
  .version(eppkg.version)
  .option('-r, --region [region]', 'AWS region (required)')
  .option('-c, --cluster [cluster]', 'ECS cluster (required)')
  .option('-p, --percent [percent]', 'Target percentage memory utilization for services', '80')
  .option('-d, --dry-run', 'Display intended changes without applying them')
  .parse(process.argv);

if (!program.region) return lib.exceptionHandler.throwException(new Error('Must specify --region'));
if (!program.cluster) return lib.exceptionHandler.throwException(new Error('Must specify --cluster'));
const desiredPercent = Number(program.percent);
if (!desiredPercent) return lib.exceptionHandler.throwException(new Error('--percent must be a number'));

const sts = new STS({ region: program.region }),
  ecs = new ECS({ region: program.region }),
  cloudWatch = new CloudWatch({ region: program.region });

let services, servicesMaxMemory;

lib.logger.action(`Validating AWS credentials...`);
return sts.getCallerIdentity().promise()
  .then((data) => {
    lib.logger.result(`Logged in as ${data.Arn}`);
    lib.logger.action(`Enumerating services in cluster: ${program.cluster}...`);
    const params = {
      cluster: program.cluster,
      launchType: 'EC2'
    }
    return paginateServices(params);
  })
  .then((serviceArns) => {
    services = serviceArns.map((arn) => { return arn.split('/').slice(-1)[0]; }).sort();
    lib.logger.result('Done.');
    lib.logger.action('Enumerating all available ECS memory utilization metrics...');
    return paginateMetrics({ Namespace: 'AWS/ECS', MetricName: 'MemoryUtilization' });
  })
  .then((metrics) => {
    lib.logger.result('Done.');
    metrics.sort((a,b) => { return (a.Dimensions[0].Value < b.Dimensions[0].Value) ? -1 : 1; });
    lib.logger.action('Fetching statistics for active services...');
    return Promise.all(metrics.map((metric) => {
      const serviceName = (metric.Dimensions && metric.Dimensions[0].Value);
      if (!serviceName || services.indexOf(serviceName) < 0) return;
      const params = {
        MetricName: metric.MetricName,
        Namespace: metric.Namespace,
        Period: 3600,
        StartTime: moment().subtract(1, 'day').toISOString(),
        EndTime: moment().subtract(1, 'minute').toISOString(),
        Dimensions: [
          {
            Name: 'ServiceName',
            Value: serviceName
          },
          {
            Name: 'ClusterName',
            Value: program.cluster
          }
        ],
        Statistics: ['Maximum'],
        Unit: 'Percent'
      };
      return cloudWatch.getMetricStatistics(params).promise();
    }));
  })
  .then((datas) => {
    lib.logger.result('Done.');
    lib.logger.action('Calculating maximum memory usage over last 24 hours...');
    const maxMemory = datas.filter((data) => { return data; }).map((data) => {
      return Math.max.apply(Math, data.Datapoints.map((dp) => { return dp.Maximum; }));
    })
    servicesMaxMemory = services.map((s, i) => { return {
      service: s,
      maxMemory: maxMemory[i]
    }});
    lib.logger.result('Done.');
    lib.logger.action('Looking up task defintions for services...');
    return Promise.all(services.map((service) => {
      return ecs.describeServices({
        services: [service],
        cluster: program.cluster
      }).promise();
    }));
  })
  .then((datas) => {
    const taskDefinitions = datas.map((data) => { return data.services[0].taskDefinition; });
    return Promise.all(taskDefinitions.map((td) => {
      return ecs.describeTaskDefinition({ taskDefinition: td }).promise();
    }));
  })
  .then((datas) => {
    lib.logger.result('Done.');
    lib.logger.action('Looking for improvements...');
    let table = new Table({ head: ['Service', 'Max Memory Used', 'Current Reservaton', 'Proposed Reservaton'] });
    datas.forEach((data, i) => {
      if (data.taskDefinition.containerDefinitions.length !== 1) return;
      const currentValue = data.taskDefinition.containerDefinitions[0].memory;
      const usedMemory = servicesMaxMemory[i].maxMemory / 100.0 * currentValue;
      const proposedValue = roundToMultipleOf((usedMemory / (desiredPercent / 100.0)), 16);
      table.push([
        servicesMaxMemory[i].service,
        `${Math.round(servicesMaxMemory[i].maxMemory)}%`,
        currentValue,
        proposedValue
      ]);
    });
    console.log(table.toString());
  })
  .catch(lib.exceptionHandler.handleException);

function roundToMultipleOf (n, multiple) {
  if (n > 0)
    return Math.ceil(n/(multiple * 1.0)) * multiple;
  else if (n < 0)
    return Math.floor(n/(multiple * 1.0)) * multiple;
  else
    return multiple;
}

function paginateServices (params, serviceArns = []) {
  params.maxResults = 10;
  return ecs.listServices(params).promise()
    .then((data) => {
      serviceArns = serviceArns.concat(data.serviceArns);
      if (data.nextToken) {
        params.nextToken = data.nextToken;
        return paginateServices(params, serviceArns);
      }
      return serviceArns;
    })
    .catch((err) => {
      console.error(err);
      throw new Error('Unable to list services');
    });
}

function paginateMetrics (params, metrics = []) {
  return cloudWatch.listMetrics(params).promise()
    .then((data) => {
      metrics = metrics.concat(data.Metrics);
      if (data.NextToken) {
        params.NextToken = data.NextToken;
        return paginateServices(params, metrics);
      }
      return metrics;
    })
    .catch((err) => {
      console.error(err);
      throw new Error('Unable to list metrics');
    });
}