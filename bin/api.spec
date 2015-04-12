
[DATABASE]
    HOST = string(default="127.0.0.1")
    PORT = integer(default=27017)
    NAME = string(default="jobmanager")

[WEB]
    HOST = string(default="0.0.0.0")
    PORT = integer(default=5000)
    DEBUG = boolean(default=False)

[LOG]
    DEBUG = boolean(default=False)
    LOGGING_FOLDER = string(default='/var/log/<app_name>')
    LOGGING_LEVEL = option("NOTSET", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL", default="INFO")
    LOGGING_METHODS = list(default="SYSLOG")
    LOGGING_SYSLOG_ADDRESS = string(default=None)
