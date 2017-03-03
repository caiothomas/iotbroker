    'use strict';

var config = require('../commons'),       
    logger = require('logops'),
    NodeCache = require('node-cache'),
    EventEmitter = require('events').EventEmitter,
    cache,
    context = {
        op: 'IoTBroker.CacheUtils'
    };     


//https://engineering.gosquared.com/error-handling-using-domains-node-js
function createCache() {
    var cacheChannel = new EventEmitter();

    logger.info(context,'Creating caches for services');

    cacheChannel.setMaxListeners(0);

    cache = {
        data: {
            subservice: new NodeCache({
                stdTTL: config.getConfig().authentication.cacheTTLs.projectIds
            }),
            roles: new NodeCache({
                stdTTL: config.getConfig().authentication.cacheTTLs.roles
            }),
            user: new NodeCache({
                stdTTL: config.getConfig().authentication.cacheTTLs.users
            }),
            validation: new NodeCache({
                stdTTL: config.getConfig().authentication.cacheTTLs.users
            })
        },
        channel: cacheChannel,
        updating: {
            subservice: {},
            roles: {},
            user: {},
            validation: {}
        }
    };
}

function cleanCache() {
    if (cache && cache.data) {
        cache.data.user = new NodeCache({
            stdTTL: config.authentication.cacheTTLs.users
        });
        cache.data.subservice = new NodeCache({
            stdTTL: config.authentication.cacheTTLs.projectIds
        });
        cache.data.roles = new NodeCache({
            stdTTL: config.authentication.cacheTTLs.roles
        });
        cache.data.validation = new NodeCache({
            stdTTL: config.authentication.cacheTTLs.validation
        });
    }
}

function createDomainEnabledCacheHandler(domain, processValueFn, cache, cacheType, cacheKey, callback) {
    return function(error, value) {
        if (error) {
            logger.debug(context, 'Error found creating cache domain handler');
            callback(error);
        } else {
            var currentValue = cache.data[cacheType].get(cacheKey)[cacheKey] || value;

            //domain.enter();
            logger.debug(context, 'Value found for cache type [%s] key [%s]: %s', cacheType, cacheKey, value);
            logger.debug(context, 'Processing with value: %s', JSON.stringify(cache.data[cacheType].get(cacheKey)[cacheKey]));

            processValueFn(currentValue, callback);
        }
    };
}

/**
 * This function introduces a cache in a Keystone function, executing the value processing function with the cached
 * value if there is one that has not expired, or executing the value retrieval function instead. If a request arrives
 * to the cache while the value is being updated, it is put on hold in an event channel, and awaken when the result
 * of the value retrieval has arrived.
 *
 * @param {String} cacheType                Name of the cache (user, roles or subserviceId).
 * @param {String} cacheKey                 Key of the item to retrieve.
 * @param {Function} retrieveRequestFn      Function to call to refresh a particular value.
 * @param {Function} processValueFn         Function to call when the value has been retrieved.
 */
function cacheAndHold(cacheType, cacheKey, retrieveRequestFn, processValueFn, callback) {
    var cachedValue = cache.data[cacheType].get(cacheKey);

    function getCacheEventId() {
        return cacheType + ':' + cacheKey;
    }
    
    logger.debug(context, 'cachedValue[cacheKey]', cachedValue);
    
    if (cachedValue && cachedValue[cacheKey]) {
        logger.debug(context, 'Value found in the cache [%s] for key [%s]: %s', cacheType, cacheKey, cachedValue[cacheKey]);

        processValueFn(cachedValue[cacheKey], callback);
    } else if (cache.updating[cacheType][cacheKey]) {
        logger.debug(context, 'Cache type [%s] updating for key [%s]. Waiting.', cacheType, cacheKey);

        cache.channel.on(getCacheEventId(),
            createDomainEnabledCacheHandler(
                null,
                processValueFn,
                cache,
                cacheType,
                cacheKey,
                callback)
            );
    } else {
        logger.debug(context, 'Value [%s] not found in cache. Retrieving new value.', cacheKey);
        cache.updating[cacheType][cacheKey] = true;
        cache.channel.removeAllListeners(cacheType);
        cache.channel.on(getCacheEventId(), createDomainEnabledCacheHandler(
            null,
            processValueFn,
            cache,
            cacheType,
            cacheKey,
            callback
        ));

        retrieveRequestFn(function(error, value) {
            logger.debug(context, 'Value [%s] for type [%s] processed with value: %s.', cacheKey, cacheType, value);

            cache.channel.emit(getCacheEventId(), error, value);
            cache.channel.removeAllListeners(getCacheEventId());
        });
    }
}

function get() {
    return cache;
}

exports.clean = cleanCache;
exports.create = createCache;
exports.cacheAndHold = cacheAndHold;
exports.get = get;
