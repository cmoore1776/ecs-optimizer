'use strict';

const logger = require('./logger');

module.exports.throwException = function (err) {
  logger.error(`ERROR: ${err.message}\n`);
  return process.exit(1);
};

module.exports.handleException = function (err) {
  if (err.message !== 'ExitGracefully') {
    logger.error(`ERROR: ${err.message}\n`);
    return process.exit(1);
  } else {
    logger.action(`ecs-optimizer completed successfully\n`);
    return process.exit(0);
  }
};
