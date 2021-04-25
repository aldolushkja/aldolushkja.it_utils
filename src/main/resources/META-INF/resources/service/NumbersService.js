const randomNumbers = async (text) => {
  console.log(text)
  const response = await fetch(
      "http://localhost:8081/strings/sha1?text=" + text);
  const body = await response.text();
  const messageEvent = new CustomEvent('number.random.event', {
    detail: body,
    bubbles: true
  })
  dispatchEvent({messageEvent});
}

export {randomNumbers};