# ecs-optimizer

Recommendation engine for ECS service memory allocation based on CloudWatch Metrics.

## Installation

```shell
npm install --global ecs-optimizer
```

## Usage

```shell
$ ./ecs-optimizer.js --help

  Usage: ecs-optimizer [options]

  Options:

    -V, --version            output the version number
    -r, --region [region]    AWS region (required)
    -c, --cluster [cluster]  ECS cluster (required)
    -t, --target [target]    Target percentage memory utilization for services (default: 75)
    -h, --help               output usage information
```

## Example output

```shell
$ ./ecs-optimizer.js --region us-east-1 --cluster my-ecs-cluster --target 75

Validating AWS credentials...
=> Logged in as arn:aws:sts::12345678910:assumed-role/role/nickname

Enumerating services in cluster: my-ecs-cluster...
=> Done.

Enumerating all available ECS memory utilization metrics...
=> Done.

Fetching statistics for active services...
=> Done.

Calculating maximum memory usage over last 24 hours...
=> Done.

Looking up task defintions for services...
=> Done.

Looking for improvements...
┌──────────────────────────┬──────────┬─────────┬──────────┐
│ Service                  │ Max Used │ Current │ Proposed │
├──────────────────────────┼──────────┼─────────┼──────────┤
│ service-a                │ 59%      │ 128     │ 112      │
├──────────────────────────┼──────────┼─────────┼──────────┤
│ service-b                │ 77%      │ 112     │ 112      │
├──────────────────────────┼──────────┼─────────┼──────────┤
│ service-c                │ 22%      │ 64      │ 32       │
├──────────────────────────┼──────────┼─────────┼──────────┤
│ service-d                │ 38%      │ 256     │ 144      │
├──────────────────────────┼──────────┼─────────┼──────────┤
│ service-e                │ 82%      │ 128     │ 144      │
└──────────────────────────┴──────────┴─────────┴──────────┘
```