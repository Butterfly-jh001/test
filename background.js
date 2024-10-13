chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "summarizeFullPage",
    title: "전체 페이지 요약",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "fullSummary",
    title: "Full 요약",
    parentId: "summarizeFullPage",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "mediumSummary",
    title: "보고서형식 요약",
    parentId: "summarizeFullPage",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "shortSummary",
    title: "간단한 요약",
    parentId: "summarizeFullPage",
    contexts: ["page"]
  });
  chrome.contextMenus.create({
    id: "summarizeSelection",
    title: "선택 영역 요약",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "translateToEnglish",
    title: "영어로 번역",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "translateToKorean",
    title: "한글로 번역",
    contexts: ["selection"]
  });
});
  
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab.id === chrome.tabs.TAB_ID_NONE) {
    console.error('Cannot send message to this tab');
    return;
  }

  let action = info.menuItemId;
  let summaryType = "";

  if (["fullSummary", "mediumSummary", "shortSummary"].includes(action)) {
    summaryType = action;
    action = "summarizeFullPage";
  }

  chrome.tabs.sendMessage(tab.id, { 
    action: action,
    summaryType: summaryType,
    text: info.selectionText
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
    } else {
      console.log('Message sent successfully');
    }
  });
});

function sendMessage(tabId, info) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js']
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to inject content script:', chrome.runtime.lastError.message);
    } else {
      const message = {
        action: info.menuItemId,
        text: info.selectionText
      };
      
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error:', chrome.runtime.lastError.message);
        } else {
          console.log('Message sent successfully');
        }
      });
    }
  });
}
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});