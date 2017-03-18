'use strict';

var logger = require('logops'),
    EventEmitter = require('events'),
    event = new EventEmitter(),    
    request = require('request'),
    config = require('../commons'),   
    fs = require('fs'),
    path = require('path'),   
    context = {
        op: 'IoTBroker.Figuardian'
    };    

event.on('figuardian', function(contextElements){
    send(contextElements.map(toProvisioningAPIFormat));
});


function toProvisioningAPIFormat(entity) {
    return {
        id: entity.id,
        type: entity.type,
        providingApplication: entity.providingApplication,
        duration: entity.duration,        
        registrationId: entity.registrationId,
        service: entity.service,
        subservice: entity.subservice        
    };
}

function send(contextElements){
    var options = {   
        method: 'POST',
        uri: config.getConfig().figuardian.url,
        json: JSON.stringify(contextElements),
        headers: { 
            'Content-type': 'application/json'
        }
    };

    if(config.getConfig().figuardian.ssl && config.getConfig().figuardian.ssl.active == true){      
        if(config.getConfig().figuardian.ssl.keyFile)        
            options.key = fs.readFileSync(path.resolve(__dirname, "../../" + config.getConfig().figuardian.ssl.keyFile));
        if(config.getConfig().figuardian.ssl.certFile)                
            options.cert = fs.readFileSync(path.resolve(__dirname, "../../" + config.getConfig().figuardian.ssl.certFile));          
        if(config.getConfig().figuardian.ssl.rejectUnauthorized)                
            options.rejectUnauthorized = (config.getConfig().figuardian.ssl.rejectUnauthorized == true ) ? true : false;                
        if(config.getConfig().figuardian.ssl.ca)
            options.ca =  fs.readFileSync(path.resolve(__dirname, "../../" + config.getConfig().figuardian.ssl.ca));                       
    }        

    logger.debug('Forwarding request:\n\n%j\n', options);
    request(options, function(error, response, body){
        if(response.statusCode == 201){
                logger.debug(context, 'Sucess to send the ContextElement to Figuardian. Status Code:', response.statusCode);                                                                                 
        } else{
                logger.debug(context, 'Error to send values to Figuardian. Status Code:', response.statusCode);                                                                                 
        }                                        
    });   
}

function getEvent(){
    return event;
}

exports.getEvent = getEvent;