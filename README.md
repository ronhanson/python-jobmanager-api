Job Manager API
===============

About
-----

This project provide a Restful API frontend to the Job Manager database (job and host data is stored in mongo).

It also provides a visualisation web interface that you can use to monitor the job and host status.

The Job Manager API is the key gateway to insert your job requests.

Project url : https://github.com/ronhanson/python-jobmanager-api


API Usage
---------

Example 1 - create a Job "ExecuteJob" :

    curl -X POST http://localhost:5000/job/ \
      -H 'accept: application/json' \
      -H 'content-type: application/json' \
      -d '{
       "type": "ExecuteJob",
       "command" : "ls -l"
    }'
    
Result:

    {
        "created": "2018-03-28 23:55:30.306875",
        "updated": "2018-03-28 23:55:30.309396",
        "uuid": "4raqFcEdQPw",
        "name": "ExecuteJob 4raqFcEdQPw",
        "status": "pending",
        "status_text": "",
        "completion": 0,
        "timeout": 43200,
        "ttl": 1,
        "history": [],
        "command": "ls -l",
        "type": "Job.ExecuteJob"
    }

Example 2 - Get status of a specific job:

    curl "http://0.0.0.0:5000/job/4raqFcEdQPw" \
        -H 'accept: application/json'
    
Result:

    {
        "created": "2018-03-28 23:55:30.306000",
        "updated": "2018-03-28 23:55:30.309000",
        "uuid": "4raqFcEdQPw",
        "name": "ExecuteJob 4raqFcEdQPw",
        "status": "pending",
        "status_text": "",
        "completion": 0,
        "timeout": 43200,
        "ttl": 1,
        "history": [],
        "command": "ls -l",
        "type": "Job.ExecuteJob"
    }

Script Usage
------------

Use jobmanager-api script :

    > bin/jobmanager-api -h

Command lines parameters are as follow :    

    usage: jobmanager-api -s SERVER [-p PORT] [-d DATABASE] [-b HTTP_BIND]
                          [-o HTTP_PORT] [-a APP_NAME] [--debug] -i module
                          [module ...] [-l LOG_FILE] [-q]
                          [-v {DEBUG,INFO,WARNING,ERROR,CRITICAL}]
                          [-c CONFIG_FILE]
                          [--create-config-file CONFIG_OUTPUT_PATH] [-h]
                          [--version]
    
    Job Manager API Args that start with '--' (eg. -s) can also be set in a config
    file (/etc/jobmanager/api.yaml or ./api.yaml or specified via -c). The config
    file uses YAML syntax and must represent a YAML 'mapping' (for details, see
    http://learn.getgrav.org/advanced/yaml). If an arg is specified in more than
    one place, then commandline values override environment variables which
    override config file values which override defaults.
    
    Job Database:
      -s SERVER, --server SERVER
                            Address of the MongoDB database server containing
                            jobs. [env var: JOBMANAGER_DATABASE_HOST] (default:
                            None)
      -p PORT, --port PORT  Port to connect the MongoDB database. [env var:
                            JOBMANAGER_DATABASE_PORT] (default: 27017)
      -d DATABASE, --database DATABASE
                            Database name containing jobs. [env var:
                            JOBMANAGER_DATABASE_NAME] (default: jobmanager)
    
    HTTP Server options:
      -b HTTP_BIND, --http-bind HTTP_BIND
                            Server IP address bindings. [env var:
                            JOBMANAGER_API_HTTP_BIND] (default: 0.0.0.0)
      -o HTTP_PORT, --http-port HTTP_PORT
                            Port to bind. [env var: JOBMANAGER_API_HTTP_PORT]
                            (default: 5000)
      -a APP_NAME, --app-name APP_NAME
                            Application name (displayed on web interface). [env
                            var: JOBMANAGER_API_APP_NAME] (default: None)
      --debug               Activate HTTP debug output. [env var:
                            JOBMANAGER_API_DEBUG] (default: False)
    
    Imports options:
      -i module [module ...], --imports module [module ...]
                            Configure current host to import one or multiple
                            python module at startup. Should not be empty. [env
                            var: JOBMANAGER_API_IMPORTS] (default: None)
    
    Log output:
      -l LOG_FILE, --log-file LOG_FILE
                            Optionally log to file. [env var:
                            JOBMANAGER_API_LOG_FILE] (default: None)
      -q, --quiet           Do not output on screen. [env var:
                            JOBMANAGER_API_QUIET] (default: False)
      -v {DEBUG,INFO,WARNING,ERROR,CRITICAL}, --verbosity {DEBUG,INFO,WARNING,ERROR,CRITICAL}
                            Log verbosity to screen. [env var:
                            JOBMANAGER_API_VERBOSITY] (default: INFO)
    
    Config file:
      -c CONFIG_FILE, --config-file CONFIG_FILE
                            config file path (default: None)
      --create-config-file CONFIG_OUTPUT_PATH
                            takes the current command line args and writes them
                            out to a config file at the given path, then exits
                            (default: None)
    
    Miscellaneous commands:
      -h, --help            show this help message and exit.
      --version             show program's version number and exit [env var:
                            JOBMANAGER_API_VERSION]
    
    "According to this program calculations, there is no such things as too much
    wine."

Example : 

    > bin/jobmanager-api -s localhost

Then open your browser on *http://0.0.0.0:5000/* 

Compatibility
-------------

This client can be used on Linux, OSX systems, or Windows.

This libraries are compatibles with Python 2.7+ and Python 3.X.

Mainly tested on 2.7, 3.4 and 3.6.


Author & Licence
----------------

Copyright (c) 2007-2018 Ronan Delacroix

This program is released under MIT Licence. Feel free to use it or part of it anywhere you want.
 
