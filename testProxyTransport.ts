// ------------------------------------------------------------
// Copyright (c) Microsoft Corporation.  All rights reserved.
// ------------------------------------------------------------

import { URLBuilder } from "@azure/core-http";
import { ServiceClient } from "@azure/core-client";
import {
  createPipelineRequest,
  createDefaultHttpClient,
  createHttpHeaders,
  PipelineRequest,
} from "@azure/core-rest-pipeline";
import * as path from "path";
import * as fs from "fs"

// This is an example integration with the Azure record/playback test proxy,
// which requires a custom implementation of the http pipeline transport used
// by the Azure SDK service clients.
// This implementation assumes the test-proxy is already running.
// Your test framework should start and stop the test-proxy process as needed.

//  extended from ServiceClient, TestProxyTransport overrides
//  the sendRequest methods defined in the parent class
//  the override method allow us to intercept and reroute app traffic sent
//  between an app and Azure to the test proxy.

export class TestProxyTransport extends ServiceClient {
  // host will point to 'localhost' since the test proxy is running locally.
  readonly host: string;
  // port will be set to 5001 since that is the port the test proxy automatically binds to.
  readonly port: number;
  // recordingId will contain a unique string provided by the test proxy
  // when a recording is first started.
  readonly recordingId: string;
  // mode defines whether the proxy should operate in 'record' or 'playback' mode.
  readonly mode: string;

  // Constructor for our custom http transport.
  constructor(host: string, port: number, recordingId: string, mode: string) {
    super();
    this.host = host!;
    this.port = port;
    this.recordingId = recordingId;
    this.mode = mode!;
  }

  // sendRequest() is called to service
  // http request. The method can be used to inject custom code
  // that modifies an http request, which is how we reroute traffic
  // to the proxy. Rerouting is done by 'stashing' the original request
  // in a request header and changing the reqeuested URI address to
  // the address of the test proxy (localhost:5001 by default).
  // The proxy reads the original request URI out of the header and
  // saves it in a JSON-formatted recording file (if in record mode),
  // or reads it from the JSON recording file (if in playback mode).
  // It will then either forward the request to the internet (record
  // mode) or forward the relevant response to your app (playback mode).
  sendRequest(options: any) {
    let httpRequest = this.redirectToTestProxy(options);
    let request = createPipelineRequest(httpRequest);
    return super.sendRequest(request);
  }

  redirectToTestProxy(httpRequest: PipelineRequest) {
    httpRequest.headers.set("x-recording-id", this.recordingId);
    httpRequest.headers.set("x-recording-mode", this.mode);
    httpRequest.headers.set(
      "x-recording-upstream-base-uri",
      httpRequest.url.substring(0, httpRequest.url.lastIndexOf("/"))
    );
    httpRequest.headers.set("Content-Type", "application/json;charset=utf-8");
    const urlBuilder = URLBuilder.parse(httpRequest.url);
    urlBuilder.setHost(this.host);
    if (this.port != undefined) {
      urlBuilder.setPort(this.port);
    }
    httpRequest.url = urlBuilder.toString();
    return httpRequest;
  }
}


// TestProxyVariables class	encapsulates variables that store values
// related to the test proxy, such as connection host (localhost),
// connection port (5001), and mode (record/playback).
export class TestProxyVariables {
  host = "";
  port = 0;
  mode = "";
  recordingId = "";
  currentRecordingPath = path
    .join(__dirname, "recordings", fs.readdirSync(path.join(__dirname, "recordings"))[0])
    .replace("\\\\", "\\");
  // Maintain an http client for POST-ing to the test proxy to start and stop recording.
  httpClient = createDefaultHttpClient();
}

// Methods to start and stop a running test proxy processing traffic between your app and Azure.
export class TestProxyMethods {
  // StartTextProxy() will initiate a record or playback session by POST-ing a request
  // to a running instance of the test proxy. The test proxy will return a recording ID
  // value in the response header, which we pull out and save as 'x-recording-id'.
  public async startTestProxy(tpv: TestProxyVariables) {
    let request = createPipelineRequest({
      url: `https://${tpv.host}:${tpv.port}/${tpv.mode}/start`,
      method: "POST",
      body: JSON.stringify({
        "x-recording-file": tpv.currentRecordingPath,
        "Content-Type": "application/json;charset=utf-8",
      }),
    });
    request.allowInsecureConnection = true;
    const response = await tpv.httpClient.sendRequest(request);
    tpv.recordingId = response.headers.get("x-recording-id")!;
  }

  // StopTextProxy() instructs the test proxy to stop recording or stop playback,
  // depending on the mode it is running in. The instruction to stop is made by
  // POST-ing a request to a running instance of the test proxy. We pass in the recording
  // ID and a directive to save the recording (when recording is running).
  // 
  // **Note that if you skip this step your recording WILL NOT be saved.**
  public async stopTestProxy(tpv: TestProxyVariables) {
    let request = createPipelineRequest({
      url: `https://${tpv.host}:${tpv.port}/${tpv.mode}/stop`,
      method: "POST",
      headers: createHttpHeaders({
        "x-recording-id": tpv.recordingId,
        "x-recording-save": true,
      }),
    });
    await tpv.httpClient.sendRequest(request);
  }
}
