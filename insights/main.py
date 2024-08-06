import sys, os

import pika
from dotenv import load_dotenv

ENV_FILE = '.env.dev' if os.getenv('ENVIRONMENT') == 'development' else '.env'
load_dotenv(dotenv_path=ENV_FILE)

from convert import to_insight

def main():
    params = pika.URLParameters(os.getenv('RABBIT_MQ'))
    params.socket_timeout = 5
    connection = pika.BlockingConnection(params)
    channel = connection.channel()

    def callback(ch, method, properties, body):
        err = to_insight.start(body, ch)
        if err:
            ch.basic_nack(delivery_tag=method.delivery_tag)
        else:
            ch.basic_ack(delivery_tag=method.delivery_tag)
    

    channel.basic_consume("insight", on_message_callback=callback)

    print("Waiting for messages. To exit press CTRL+C")

    channel.start_consuming()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Interrupted")
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0)