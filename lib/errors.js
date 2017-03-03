var util = require('util');

var errors = {
    MissingHeaders: function(msg) {
        this.name = 'MISSING_HEADERS';
        this.message = 'Some headers were missing from the request: ' + msg;
        this.code = 400;
    },
    TokenDoesNotMatchService: function() {
        this.name = 'TOKEN_DOES_NOT_MATCH_SERVICE';
        this.message = 'The provided token does not belong to the provided service.';
        this.code = 401;
    },
    ActionNotFound: function() {
        this.name = 'ACTION_NOT_FOUND';
        this.message = 'The system wasn\'t able to guess the action type or the request';
        this.code = 400;
    },
    WrongJsonPayload: function() {
        this.name = 'WRONG_JSON_PAYLOAD';
        this.message = 'The system wasn\'t able to parse the given JSON payload (either it was empty or wrong)';
        this.code = 400;
    },
    AccessControlConnectionError: function(e) {
        this.name = 'ACCESS_CONTROL_CONNECTION_ERROR';
        this.message = 'There was a connection error accessing the Access Control: ' + e.message;
        this.code = 500;
    },
    AccessControlValidationError: function(message) {
        this.name = 'ACCESS_CONTROL_VALIDATION_ERROR';
        this.message = 'The Access Control failed to make a decision due to the following error: ' + message;
        this.code = 500;
    },
    KeystoneAuthenticationError: function(msg) {
        this.name = 'KEYSTONE_AUTHENTICATION_ERROR';
        this.message = 'There was a connection error while authenticating to Keystone: ' + msg;
        this.code = 500;
    },
    KeystoneAuthenticationRejected: function(code) {
        this.name = 'KEYSTONE_AUTHENTICATION_REJECTED';
        this.message = 'User authentication was rejected with code: ' + code;
        this.code = 401;
    },
    KeystoneSubserviceNotFound: function(name) {
        this.name = 'KEYSTONE_SUBSERVICE_NOT_FOUND';
        this.message = 'Could not find subservice with name [' + name + '] in Keystone.';
        this.code = 401;
    },
    PepProxyAuthenticationRejected: function(code) {
        this.name = 'PEP_PROXY_AUTHENTICATION_REJECTED';
        this.message = 'Proxy authentication was rejected with code: ' + code;
        this.code = 500;
    },
    RolesNotFound: function(subservice) {
        this.name = 'ROLES_NOT_FOUND';
        this.message = 'No roles were found for the user token in the give subservice: ' + subservice;
        this.code = 401;
    },
    AccessDenied: function() {
        this.name = 'ACCESS_DENIED';
        this.message = 'The user does not have the appropriate permissions to access the selected action';
        this.code = 403;
    },
    TemplateLoadingError: function(e) {
        this.name = 'TEMPLATE_LOADING_ERROR';
        this.message = 'There was an error loading the templates for the validation Request: ' + e.message;
        this.code = 500;
    },
    UnexpectedContentType: function(contentType) {
        this.name = 'UNEXPECTED_CONTENT_TYPE';
        this.message = 'The MIME content type received is not supported: ' + contentType;
        this.code = 415;
    },
    TargetServerError: function(msg) {
        this.name = 'TARGET_SERVER_ERROR';
        this.message = 'There was an error redirecting the request to the target server: ' + msg;
        this.code = 500;
    },
    UserNotFound: function() {
        this.name = 'USER_NOT_FOUND';
        this.message = 'User credentials not found';
        this.code = 400;
    },
    UnsupportedContentType: function(type) {
        this.name = 'UNSUPPORTED_CONTENT_TYPE';
        this.message = 'Unsuported content type in the context request: ' + type;
        this.code = 400;
    }, 
    BadRequest: function(msg) {
        this.name = 'BAD_REQUEST';
        this.message = 'Request error connecting to the Context Broker: ' + msg;
        this.code = 400;
    },
    ConnectFail: function(msg) {
        this.name = 'BAD_REQUEST';
        this.message = 'Request error connecting to providers Applications: ' + msg;
        this.code = 400;
    },
    EntityNotFound: function(id) {
        this.name = 'ENTITY_NOT_FOUND';
        this.message = 'The entity with the requested id [' + id + '] was not found.';
        this.code = 404;
    },
    MissingAttributes: function(msg) {
        this.name = 'MISSING_ATTRIBUTES';
        this.message = 'The request was not well formed:' + msg;
        this.code = 400;        
    }, 
    InternalDbError: function(msg) {
        this.name = 'INTERNAL_DB_ERROR';
        this.message = 'An internal DB Error happened: ' + msg;
        this.code = 400;
    },        
};

for (var errorFn in errors) {
    if (errors.hasOwnProperty(errorFn)) {
        util.inherits(errors[errorFn], Error);
    }
}

module.exports = errors;

