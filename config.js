var config = {};

// Protected Resource configuration
//--------------------------------------------------
// Configures the address of the component that is being proxied and the address of the proxy itself.
config.resource = {
    original: {
        /**
         * Host that is being proxied.
         */
        host: 'localhost',

        /**
         * Port where the proxied server is listening.
         */
        port: 10026
    },

    broker: {
        
        concat: true,//Concatenate response (true) or merge attributes (false)
        
        host: 'http://192.168.1.9',
        
        /**
         * Port where the proxy is listening to redirect requests.
         */
        port: 1026,
        
        portSSL: 1027,

        /**
         * Administration port for the proxy.
         */
        adminPort: 22211
    }
};


/**
 * Defines the configuration for the Device Registry, where all the information about devices and configuration
 * groups will be stored. There are currently just two types of registries allowed:
 *
 * - 'memory': transient memory-based repository for testing purposes. All the information in the repository is 
 *             wiped out when the process is restarted.
 *
 * - 'mongodb': persistent MongoDB storage repository. All the details for the MongoDB configuration will be read
 *             from the 'mongoDb' configuration property.
 */
config.EntityRegistry = {
    type: 'memory'
};

config.mongodb = {
    host: 'localhost',
    port: '27017',
    db: 'iotbroker'
    //replicaSet: ''
};

config.ssl = {
    /**
     * This flag activates the HTTPS protocol in the server. The endpoint always listen to the indicated port
     * independently of the chosen protocol.
     */
    active: true,

    /**
     * Key file to use for codifying the HTTPS requests. Only mandatory when the flag active is true.
     */
    keyFile: 'certificados/server/key.pem',

    /**
     * SSL Certificate to present to the clients. Only mandatory when the flag active is true.
     */
    certFile: 'certificados/server/cert.pem',

    ca: '',
    requestCert: false,
    rejectUnauthorized: false                 
}

config.iotAgentSSL= {
        active: true,
        keyFile: 'certificados/server/key.pem',
        certFile: 'certificados/server/cert.pem',
        //ca: '',
        rejectUnauthorized: false
},
/*
config.authentication = {
    enable: true,
    module: 'figuardian',
    retries: 3,
    cacheTTLs: {
        users: 5,
    },
    options: {
        protocol: 'http',
        host: 'localhost',
        port: 80,
        path: '/orion/token.php'
    }
};
*/

config.authentication = {
    enable: true,
    roles: false,
    module: 'keystone',
    user: 'caio',
    password: 'caio',
    domainName: 'figuardian',
    retries: 3,
    cacheTTLs: {
        users: 1000,
        projectIds: 1000,
        roles: 60,
        validation: 120
    },
    options: {
        protocol: 'http',
        host: 'localhost',
        port: 5000,
        path: '/v3/role_assignments',
        authPath: '/v3/auth/tokens'
    }
};


/**
 * Configuration to remove entities which is expired.
 * This duration  is defined in the Registration Context
 */
config.expiration = {
    enable: true,
    interval: 30000
}

/**
 * If this flag is activated, whenever the pepProxy is not able to redirect a request, instead of returning a 501 error
 * (that is the default functionality) the PEP Proxy process will exit with a -2 code.
 */
config.dieOnRedirectError = false;

/**
 * Configures the maximum number of clients that can be simultaneously queued while waiting for the PEP to
 * authenticate itself against Keystone (due to an expired token).
 */
config.maxQueuedClients = 1000;

/*
Para inserir algum plugin
config.middlewares = {
    require: 'lib/plugins/Module',
    functions: [
        'execute'
    ]
};
*/

config.figuardian = {
    url: 'http://localhost/orion/figuardian.php',
    ssl: {
        active: false,
        keyFile: 'certificados/figuardian/key.pem',
        certFile: 'certificados/figuardian/cert.pem',
        ca: 'certificados/figuardian/cert.pem',
        rejectUnauthorized: true
    }
};
/**
 * Default log level. Can be one of: 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'
 */
config.logLevel = 'DEBUG';

module.exports = config;
