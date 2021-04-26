const buildSha1 = async (text) => {
  console.log("generateSha1- input: " + text);

  const endpoint = "http://localhost:6080/strings/sha1?text=" + text;
  const response = await fetch(endpoint);
  const sha1 = await response.text();

  console.log("generateSha1- response_body: " + sha1);

  const messageEvent = new CustomEvent('sha1-event', {
    detail: sha1,
    bubbles: true
  });
  dispatchEvent(messageEvent);
}

const buildSha256 = async (text) => {
  console.log(text)
  const response = await fetch(
      "http://localhost:6080/strings/sha256?text=" + text);
  const sha256 = await response.text();
  console.log("Response from server: " + sha256)
  const messageEvent = new CustomEvent('sha256-event', {
    detail: sha256,
    bubbles: true
  });
  dispatchEvent(messageEvent);
}

const encodeBase64 = async (text) => {
  const response = await fetch(
      "http://localhost:6080/strings/base64/encode?text=" + text);
  const base64 = await response.text();
  console.log("Base64Encode - Response from server: " + base64)
  const messageEvent = new CustomEvent('base64-encode-event', {
    detail: base64,
    bubbles: true
  });
  dispatchEvent(messageEvent);
}

const decodeBase64 = async (text) => {
  const response = await fetch(
      "http://localhost:6080/strings/base64/decode?text=" + text);
  const base64 = await response.text();
  console.log("Base64Decode - Response from server: " + base64)
  const messageEvent = new CustomEvent('base64-decode-event', {
    detail: base64,
    bubbles: true
  });
  dispatchEvent(messageEvent);
}

// const randomUUID = async(text) => {
//     console.log(text)
//     const response = await fetch("http://localhost:8081/strings/uuid" + text);
//     const body = await response.text();
//     const messageEvent = new CustomEvent('uuid.random.event ', {
//         detail: body,
//         bubbles: true
//     })
//     dispatchEvent({ messageEvent });
// }

export {buildSha1, buildSha256, encodeBase64};