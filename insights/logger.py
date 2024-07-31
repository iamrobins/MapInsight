import logging
import json

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": self.formatTime(record, self.datefmt),
            "name": record.name,
            "level": record.levelname,
            "message": record.getMessage(),
            "pathname": record.pathname,
            "lineno": record.lineno,
            "funcName": record.funcName,
            "process": record.process,
            "threadName": record.threadName
        }
        if record.exc_info:
            log_record["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(log_record)

# Create a custom logger
logger = logging.getLogger('my_logger')
logger.setLevel(logging.DEBUG)

# Create handlers
c_handler = logging.FileHandler('combined.log')
c_handler.setLevel(logging.DEBUG)

e_handler = logging.FileHandler('error.log')
e_handler.setLevel(logging.ERROR)

# Create JSON formatter
json_formatter = JsonFormatter()

# Add formatter to the handlers
c_handler.setFormatter(json_formatter)
e_handler.setFormatter(json_formatter)

# Add handlers to the logger
logger.addHandler(c_handler)
logger.addHandler(e_handler)


# Example logs
# logger.debug('This is a debug message')
# logger.info('This is an info message')
# logger.warning('This is a warning message')
# logger.error('This is an error message')
# logger.critical('This is a critical message')

# Example usage
# try:
#     x = 10 / 0
# except Exception as e:
#     logger.error('EXCEPTION BLOCK', exc_info=True)
