'use strict';

var constants = {
    X_FORWARDED_FOR_HEADER: 'x-forwarded-for',
    AUTHORIZATION_HEADER: 'x-auth-token',
    ORGANIZATION_HEADER: 'fiware-service',
    PATH_HEADER: 'fiware-servicepath',

    GET_ROLES_PATH: '/user',
    DEFAULT_MONGODB_RETRIES: 5,
    DEFAULT_MONGODB_RETRY_TIME: 5,    
};


module.exports = constants;
