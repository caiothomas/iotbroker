#!/usr/bin/env node
// to execute a bin script we must provide a hint as to Node's bin location.
var async = require('async'),
    apply = async.apply,
    proxy = require('../lib/index'),
    config_file = require('../config'),
    ngsi = require('../lib/ngsi/ngsi'),
    config = require('../lib/commons'),
    logger = require('logops'),
    db = require('../lib/model/dbConn'),
    context = {
        op: 'IoTBroker.Broker'
    },
    NodeCache = require( "node-cache" );
    EventEmitter = require('events').EventEmitter;
    waitingRequests = new EventEmitter();

function doActivate(newConfig) {
    var registry;

    logger.format = logger.formatters.pipe;

    config.setConfig(newConfig);
    
    logger.info(context, 'Activating IOT Broker NGSI Library.');

    if (newConfig.EntityRegistry &&
        newConfig.EntityRegistry.type &&
        newConfig.EntityRegistry.type === 'mongodb') {
        logger.info(context, 'MongoDB Device registry selected for NGSI Library');

        registry = require('../lib/entity/entityRegistryMongo');
    } else {
        logger.info(context, 'Falling back to Transient Memory registry for NGSI Library');

        registry = require('../lib/entity/entityRegistryMemory');
    }

    config.setRegistry(registry);
    
    async.series([
        db.configureDb,
        apply(proxy.start),
    ], function(error, proxyObj) {
        if (error) {
            process.exit();
        } else {
            console.log('Loading middlewares');      
            console.log('Server started');
        }
    });    
}

function teste(){
    var myCache = new NodeCache( { stdTTL: 100, checkperiod: 120 } );
    var obj = { my: "Special", variable: 42 };
    var obj1 = { my: "1111", variable: 1111 };
    
    myCache.set( "myKey", obj, function( err, success ){
      if( !err && success ){
        console.log( success );
      }
    });
    
    myCache.set( "myKey2", obj1, function( err, success ){
      if( !err && success ){
        console.log( success );
      }
    });        
    
    myCache.keys( function( err, mykeys ){
      if( !err ){
        console.log( " LIST " + mykeys );
       // [ "all", "my", "keys", "foo", "bar" ] 
      }
    });
    
    try{
        value = myCache.get("myKey", true );
        console.log( "console mykey" + value.my + " " +value.variable );
        
    } catch( err ){
        // ENOTFOUND: Key `not-existing-key` not found 
    }    
    
    myCache.del( "myKey", function( err, count ){
      if( !err ){
        console.log("delete " + count ); // 1 
      }
    });
    
}

function evento(){
    waitingRequests.setMaxListeners(0);
    waitingRequests.removeAllListeners('token');
    console.log('removeAllListeners');

    waitingRequests.addListener('token', function() {
        console.log('bar');
    });    
    
    waitingRequests.on('token', function() {
        console.log('teste');
    });   

    waitingRequests.on('token', function() {
        console.log('adele');
    });       
    
    console.log('emiit before');
    waitingRequests.emit("token");
    console.log('emiit after');   
}

//evento();

//teste();
doActivate(config_file);
