/**
 * Python that runs inside Pyodide, shared by the browser exercise runner and
 * `npm run check-content`, so a solution is judged the same way in both.
 *
 * `requests` isn't part of Pyodide's core, and downloading packages at run time
 * would break offline use, so this small stand-in gives learners the same
 * `requests.get(url).json()` they'll use in real Python.
 */
export const REQUESTS_SHIM = String.raw`
import json as _json
from js import __gwHttp

class ConnectionError(Exception):
    pass

class Response:
    def __init__(self, status_code, text, headers):
        self.status_code = status_code
        self.text = text
        self.headers = headers
        self.ok = status_code < 400
    def json(self):
        return _json.loads(self.text)
    def raise_for_status(self):
        if not self.ok:
            raise Exception(f"HTTP error {self.status_code}")
    def __repr__(self):
        return f"<Response [{self.status_code}]>"

def request(method, url, headers=None, json=None, data=None, params=None):
    if params:
        from urllib.parse import urlencode
        url = url + ("&" if "?" in url else "?") + urlencode(params)
    headers = dict(headers or {})
    body = data
    if json is not None:
        body = _json.dumps(json)
        headers.setdefault("Content-Type", "application/json")
    raw = _json.loads(__gwHttp(method, url, _json.dumps(headers), body if body is not None else ""))
    if raw.get("error"):
        raise ConnectionError(raw["error"])
    return Response(raw["status"], raw["body"], raw["headers"])

def get(url, **kw): return request("GET", url, **kw)
def post(url, **kw): return request("POST", url, **kw)
def put(url, **kw): return request("PUT", url, **kw)
def delete(url, **kw): return request("DELETE", url, **kw)
`;

export const HARNESS = String.raw`
import sys, io, json, traceback

def __gw_run(code, tests_json):
    ns = {"__name__": "__main__"}
    out = io.StringIO()
    saved = sys.stdout, sys.stderr
    sys.stdout = out
    sys.stderr = out
    error = None
    try:
        exec(compile(code, "my_script.py", "exec"), ns)
    except BaseException as e:
        frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "my_script.py"]
        lines = ["Traceback (most recent call last):"] + [
            f'  File "my_script.py", line {f.lineno}, in {f.name}' for f in frames
        ]
        lines += traceback.format_exception_only(type(e), e)
        error = "\n".join(x.rstrip() for x in lines)
    finally:
        sys.stdout, sys.stderr = saved
    output = out.getvalue()
    results = []
    ns["__output__"] = output
    for t in json.loads(tests_json):
        if error is not None:
            results.append({"name": t["name"], "passed": False, "message": "Your script stopped with an error before this could be checked."})
            continue
        try:
            sys.stdout = io.StringIO()
            exec(t["code"], ns)
            results.append({"name": t["name"], "passed": True, "message": ""})
        except AssertionError as e:
            results.append({"name": t["name"], "passed": False, "message": str(e) or "This check didn't pass yet."})
        except Exception as e:
            results.append({"name": t["name"], "passed": False, "message": f"{type(e).__name__}: {e}"})
        finally:
            sys.stdout = saved[0]
    return json.dumps({"output": output, "error": error, "tests": results})
`;

export interface PythonRunResult {
  output: string;
  error: string | null;
  tests: { name: string; passed: boolean; message: string }[];
}
