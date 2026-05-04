chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_TEXT') {
    const pageTitle = document.title;
    let content = '';

    // Extraction logic: article > main > body
    const article = document.querySelector('article');
    const main = document.querySelector('main');

    if (article) {
      content = article.innerText;
    } else if (main) {
      content = main.innerText;
    } else {
      content = document.body.innerText;
    }

    // Clean text: remove extra whitespace and limit length
    const cleanedText = content
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 10000);

    sendResponse({
      text: cleanedText,
      title: pageTitle
    });
  }
  // Return true is not strictly needed for direct response, but good practice
  return true;
});
