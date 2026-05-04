chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PROCESS_TEXT') {
    console.log('Background script received PROCESS_TEXT request');
    
    // Simulate AI processing delay
    setTimeout(() => {
      sendResponse({
        summary: "STUB: This is a mock summary. The communication relay is working!"
      });
    }, 1500);

    // Keep the message channel open for asynchronous response
    return true;
  }
});
