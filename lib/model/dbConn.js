'use strict';

var mongoose = require('mongoose'),
    config = require('../commons'),
    constants = require('../constants'),
    logger = require('logops'),
    async = require('async'),
    errors = require('../errors'),
    defaultDb,
    DEFAULT_DB_NAME = 'iotbroker',
    context = {
        op: 'IotBroker.DbConn'
    };

function loadModels() {
    require('./Entity').load(defaultDb);
}

/**
 * Creates a new connection to the Mongo DB.
 *
 * @this Reference to the dbConn module itself.
 */
function init(host, db, port, username, password, options, callback) {
    /*jshint camelcase:false, validthis:true */
    var hosts,
        url,
        credentials = '',
        retries = 0,
        lastError,
        maxRetries = (config.getConfig().mongodb && config.getConfig().mongodb.retries ||
            constants.DEFAULT_MONGODB_RETRIES);

    if (username && password) {
        credentials = username + ':' + password + '@';
    }

    function addPort(item) {
        return item + ':' + port;
    }

    function commaConcat(previous, current, currentIndex) {
        if (currentIndex !== 0) {
            previous += ',';
        }

        previous += current;

        return previous;
    }

    hosts = host.split(',').map(addPort).reduce(commaConcat, '');

    url = 'mongodb://' + credentials + hosts + '/' + db;

    function createConnectionHandler(error, results) {
        if (defaultDb) {
            logger.info(context, 'Successfully connected to MongoDB.');
            module.exports.db = defaultDb;
            loadModels();
        } else {
            logger.error(context, 'MONGODB-002: Error found after [%d] attempts: %s', retries, error || lastError);
        }

        callback(error);
    }

    function retryCheck() {
        return !defaultDb && retries < maxRetries;
    }

    function connectionAttempt(url, options, callback) {
        var candidateDb;

        logger.info(context, 'Attempting to connect to MongoDB instance. Attempt %d', retries);

        candidateDb = mongoose.createConnection(url, options, function(error, result) {
            if (error) {
                logger.error(context, 'MONGODB-001: Error trying to connect to MongoDB: %s', error);
                lastError = error;
            } else {
                defaultDb = candidateDb;

                defaultDb.on('error', function(error) {
                    alarms.raise(constants.MONGO_ALARM, error);

                    logger.error(context, 'Mongo Driver error: %j', error);
                });
                defaultDb.on('connecting', function(error) {
                    logger.debug(context, 'Mongo Driver connecting');
                });
                defaultDb.on('connected', function() {
                    logger.debug(context, 'Mongo Driver connected');
                });
                defaultDb.on('reconnected', function() {
                    logger.debug(context, 'Mongo Driver reconnected');
                });
                defaultDb.on('disconnected', function() {
                    logger.debug(context, 'Mongo Driver disconnected');
                });
                defaultDb.on('disconnecting', function() {
                    logger.debug(context, 'Mongo Driver disconnecting');
                });
                defaultDb.on('open', function() {
                    logger.debug(context, 'Mongo Driver open');
                });
                defaultDb.on('close', function() {
                    logger.debug(context, 'Mongo Driver close');
                });
            }

            callback();
        });
    }

    function tryCreateConnection(callback) {
        var attempt = async.apply(connectionAttempt, url, options, callback),
            seconds = (config.getConfig().mongodb && config.getConfig().mongodb.retryTime ||
                constants.DEFAULT_MONGODB_RETRY_TIME);

        retries++;

        if (retries === 1) {
            logger.info(context, 'First connection attempt');
            attempt();
        } else {
            logger.info(context, 'Waiting %d seconds before attempting again.', seconds);
            setTimeout(attempt, seconds * 1000);
        }
    }

    defaultDb = null;
    async.whilst(retryCheck, tryCreateConnection, createConnectionHandler);
}

function configureDb(callback) {
    /*jshint camelcase:false, validthis:true */
    var currentConfig = config.getConfig();

    if ((currentConfig.EntityRegistry && currentConfig.EntityRegistry.type === 'mongodb') ||
        (currentConfig.stats && currentConfig.stats.persistence === true)) {
        
        if (!currentConfig.mongodb || !currentConfig.mongodb.host) {
            logger.fatal(context, 'MONGODB-003: No host found for MongoDB driver.');
            callback(new errors.BadConfiguration('No host found for MongoDB driver'));
        } else {
            var dbName = currentConfig.mongodb.db,
                port = currentConfig.mongodb.port || 27017,
                options = {};

            if (!currentConfig.mongodb.db) {
                dbName = DEFAULT_DB_NAME;
            }

            if (currentConfig.mongodb.replicaSet) {
                options.replset = { rs_name: currentConfig.mongodb.replicaSet };
            }

            init(config.getConfig().mongodb.host, dbName, port,
                currentConfig.username, currentConfig.password, {}, callback);
        }
    } else {
        callback();
    }
}

exports.configureDb = configureDb;
exports.db = defaultDb;
exports.DEFAULT_DB_NAME = DEFAULT_DB_NAME;