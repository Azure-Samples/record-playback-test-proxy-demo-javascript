// ------------------------------------------------------------
// Copyright (c) Microsoft Corporation.  All rights reserved.
// ------------------------------------------------------------

import { odata, TableClient, TableServiceClient } from "@azure/data-tables";
import {
  TestProxyMethods,
  TestProxyTransport,
  TestProxyVariables,
} from "./testProxyTransport";

import * as dotenv from "dotenv";
dotenv.config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Beginning of app code.
class CosmosDBTablesTestProxy {
  static async main() {
    //=====================================================================//
    // Test proxy prologue. The following code is necessary to configure   //
    // the test proxy, as well as to start the record or playback process. // 
    //=====================================================================//
    // Load environment variables from the local .env file
    let tpv = new TestProxyVariables();
    let tpm = new TestProxyMethods();
    let use_proxy = process.env.USE_PROXY;
    
    if (use_proxy == "true") {
      tpv.host = process.env.PROXY_HOST!;
      tpv.port = Number(process.env.PROXY_PORT);
      tpv.mode = process.env.PROXY_MODE!;
      await tpm.startTestProxy(tpv);
    }

    let tpt = new TestProxyTransport(
      tpv.host!,
      tpv.port,
      tpv.recordingId,
      tpv.mode!
    );

    // Override the http transport via httpClient when using the test proxy.
    // If not using the proxy, the default client http transport will be used.

    //=========================================================================================//
    // End of test proxy prologue. Original test code starts here. Everything after this point //
    // represents an app interacting with the Azure Table Storage service.                     //
    //=========================================================================================//

    let tableClient = TableClient.fromConnectionString(
      process.env.COSMOS_CONNECTION_STRING!,
      "adventureworks",
      { httpClient: tpt }
    );
    await tableClient.createTable();

    // Create new item using composite key constructor
    let prod1 = {
      rowKey: "68719518388",
      partitionKey: "gear-surf-surfboards",
      Name: "Ocean Surfboard1",
      Quantity: 8,
      Sale: true,
    };

    // Add new item to server-side table
    await tableClient.createEntity(prod1);

    // Read a single item from container
    let product = await tableClient.getEntity(
      "gear-surf-surfboards",
      "68719518388"
    );
    console.log("Single product:");
    console.log(product.Name);

    // Read multiple items from container
    let prod2 = {
      rowKey: "68719518390",
      partitionKey: "gear-surf-surfboards",
      Name: "Sand Surfboard2",
      Quantity: 5,
      Sale: false,
    };

    await tableClient.createEntity(prod2);

    let products = tableClient.listEntities({
      queryOptions: { filter: odata`PartitionKey eq 'gear-surf-surfboards'` },
    });

    console.log("Multiple products:");
    for await (const product of products) {
      console.log(`${product.Name}`);
    }

    await tableClient.deleteTable();

    //=============================================================================//
    // Test proxy epilogue - necessary to stop the test proxy. Note that if you do //
    // not stop the test proxy after recording, your recording WILL NOT be saved!  //
    //=============================================================================//
    if (use_proxy == "true") {
      await tpm.stopTestProxy(tpv);
    }
  }
}

CosmosDBTablesTestProxy.main().catch((err) => {
  console.log(err);
});
