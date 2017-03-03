'use strict';

var packageInformation = require('../../package.json'),
    config = require('../../config'),
    logger = require('logops');

function retrieveVersion(req, res, next) {
    res.status(200).json({
        version: packageInformation.version,
        port: config.resource.broker.port
    });
}

//funcao put para definir o nivel do log
function changeLogLevel(req, res, next) {
    var levels = ['INFO', 'ERROR', 'FATAL', 'DEBUG', 'WARNING'];

    if (!req.query.level) {
        res.status(400).json({
            error: 'log level missing'
        });
    } else if (levels.indexOf(req.query.level.toUpperCase()) < 0) {
        res.status(400).json({
            error: 'invalid log level'
        });
    } else {
        logger.setLevel(req.query.level.toUpperCase());
        res.status(200).send('');
    }
}

/**
 * Return the current log level.
 */
function getLogLevel(req, res, next) {
    res.status(200).json({
        level: logger.getLevel()
    });
}

function loadContextRoutes(router) {
    router.get('/version', retrieveVersion);
    router.put('/admin/log', changeLogLevel);
    router.get('/admin/log', getLogLevel);
}

exports.loadContextRoutes = loadContextRoutes;
