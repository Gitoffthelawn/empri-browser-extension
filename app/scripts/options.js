import { DateTime } from "luxon";
import { clearStudyData, initStudy} from "./study.js";

(() => {
  let msu = document.querySelector("#mostsigunit");
  let exampleField = document.querySelector("#example");
  let studyInfo = document.querySelector("#study-info");

  function saveOptions() {
    return browser.storage.sync.set({ mostsigunit: msu.value })
    .catch(error => console.error(error));
  }

  function restoreOptions() {
    // load old study data to check if we should show the notice
    return Promise.all([
      browser.storage.sync.get("mostsigunit"),
      browser.storage.local.get([
        "msuChoices",
        "studyOptIn",
        "viewCounts",
      ]),
    ])
    .then((results) => {
      let msuval = results[0].mostsigunit;
      let optin = results[1].studyOptIn;
      let choices = results[1].msuChoices;
      let views = results[1].viewCounts;

      if (msuval) {
        msu.value = msuval;
      }
      // hide notice if no signs of prev study participation is found
      if (!optin && !choices && !views) {
        studyInfo.style.display = "none";
      }
    })
    .then(() => updateExampleField())
    .catch(error => console.error(error));
  }

  function updateExampleField() {
    let dateTime = DateTime.fromISO("2020-09-02T23:23:23");
    switch (msu.value) {  // fall through
      case "year":
        dateTime = dateTime.set({ month: 1 });
      case "month":
        dateTime = dateTime.set({ day: 1 });
      case "day":
        dateTime = dateTime.set({ hour: 0 });
      case "hour":
        dateTime = dateTime.set({ minute: 0 });
      case "minute":
        dateTime = dateTime.set({ second: 0 });
      case "second":
        // nothing to redact if seconds are wanted
        break;
    }
    let v = dateTime.toFormat("yyyy-MM-dd'T'HH:mm:ss");
    console.log(v);
    exampleField.value = v;
  }

  document.addEventListener("DOMContentLoaded", restoreOptions);
  document.querySelector("#mostsigunit").addEventListener("change", function () {
    saveOptions()
    .then(() => {
      updateExampleField();
    })
    .catch(error => console.error(error));
  });
})();
