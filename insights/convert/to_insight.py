import json, os
import http.client

def start(body, ch):
    data = json.loads(body)
    url = os.getenv("NOTIFICATION_URL")
    endpoint = "/update-status"
    payload = json.dumps({
        "jobId": data["jobId"],
        "status": "complete",
        "data": data["data"]
    })
    headers = {
        "Content-Type": "application/json"
    }

    conn = http.client.HTTPConnection(url)

    try:
        conn.request("POST", endpoint, payload, headers)
        response = conn.getresponse()
        if response.status != 200:
            raise Exception(f"HTTP error: {response.status} {response.reason}")
        response_data = response.read().decode()
        print(f"Response: {response_data}")
    except Exception as e:
        print(f"Request failed: {e}")
    finally:
        conn.close()