// The exact payload structure logged by the user during their simulation

// The exact payload structure logged by the user during their simulation
const mockEvent = {
    "$typeName": "capabilities.networking.http.v1alpha.Payload",
    "input": {
        "type": "Buffer",
        "data": [
            123, 34, 99, 104, 101, 113, 117, 101, 73, 100, 34, 58, 34, 48,
            120, 49, 50, 51, 52, 53, 54, 55, 56, 49, 50, 51, 52, 53, 54, 55,
            56, 49, 50, 51, 52, 53, 54, 55, 56, 49, 50, 51, 52, 53, 54, 55,
            56, 49, 50, 51, 52, 53, 54, 55, 56, 49, 50, 51, 52, 53, 54, 55,
            56, 49, 50, 51, 52, 53, 54, 55, 56, 49, 50, 51, 52, 53, 54, 55,
            56, 34, 44, 34, 112, 114, 111, 111, 102, 66, 97, 115, 101, 54,
            52, 34, 58, 34, 90, 88, 104, 104, 98, 88, 66, 115, 90, 83, 66,
            54, 97, 121, 66, 119, 99, 109, 57, 118, 90, 105, 66, 48, 97, 71,
            70, 48, 73, 71, 108, 122, 73, 72, 90, 108, 99, 110, 107, 103, 98,
            71, 57, 117, 90, 122, 48, 61, 34, 44, 34, 116, 97, 114, 103, 101,
            116, 67, 104, 97, 105, 110, 73, 100, 34, 58, 49, 49, 49, 53, 53,
            52, 50, 48, 125
        ]
    }
};

// We know `onHttpTrigger` is exported natively if we change main.ts temporarily,
// or we can test the buffer logic isolated here:

try {
    const bufferArray = mockEvent.input.data;
    const bufferString = Buffer.from(bufferArray).toString('utf-8');
    const payload = JSON.parse(bufferString);

    console.log("Extraction Success! Parsed payload:");
    console.log(payload);

    if (payload.targetChainId && payload.chequeId && payload.proofBase64) {
        console.log("All required fields are present.");
    } else {
        console.error("Missing required fields.");
    }
} catch (e) {
    console.error("Extraction Failed:", e);
}
