'use strict';

var mongoose = require('mongoose');

var Schema = mongoose.Schema;
//var Long = mongoose.Schema.Types.Long;

var Entity = new Schema({
    type: String,
    isPattern: String,
    id: String,
    type: String,
    providingApplication: String,
    duration: String,
    registrationId: String,
    service: String,
    subservice: String,
    expiration:  Date
});

                
function load(db) {
    module.exports.model = db.model('Entity', Entity);
    module.exports.internalSchema = Entity;
}

module.exports.load = load;
