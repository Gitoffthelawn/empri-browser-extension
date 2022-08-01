browser.storage.sync.get("ghrOn").then((res) => {
  if (typeof res.ghrOn == "undefined") {
    browser.storage.sync.set({
      ghrOn: true,
      mostsigunit: "year",
    });
  } else if (!res.ghrOn) {
    browser.browserAction.setIcon({
      path: {
        19: "../images/off-19.png",
        38: "../images/off-38.png",
      },
    });
  }
});

browser.runtime.onInstalled.addListener(async ({ reason, temporary }) => {
  if (temporary) return; // skip during development
  switch (reason) {
    case "install":
      {
        const url = browser.runtime.getURL("pages/welcome.html");
        await browser.tabs.create({ url });
      }
      break;
    case "update":
      {
        browser.storage.local.get("studyOptIn")
        .then((res) => {
          if (res.studyOptIn) {
            const url = browser.runtime.getURL("pages/update.html");
            return browser.tabs.create({ url });
          }
        })
        .then(() => {
          // opt out to not show message again
          return browser.storage.local.set({ studyOptIn: false });
        })
        .catch((error) => console.error(error));
      }
      break;
  }
});
