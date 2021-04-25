const generateSha1 = async (text) => {
  console.log("generateSha1- input: " + text);

  const endpoint = "http://localhost:6080/strings/sha1?text=" + text;
  const response = await fetch(endpoint);
  const body = await response.text();

  console.log("generateSha1- response_body: " + body);

  const messageEvent = new CustomEvent('sha1-event', {
    detail: body,
    bubbles: true
  });
  dispatchEvent(messageEvent);
}

// const generateSha256 = async(text) => {
//     console.log(text)
//     const response = await fetch("http://localhost:8081/strings/sha256?text=" + text);
//     const body = await response.text();
//     const messageEvent = new CustomEvent('sha256.event ', {
//         detail: body,
//         bubbles: true
//     })
//     dispatchEvent({ messageEvent });
// }

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

export {generateSha1};