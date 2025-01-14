import { DateTime } from "luxon";
import { v4 as uuidv4 } from "uuid";
import { RunningStats } from "./stats.js";

export class MsuChoiceRecord {
  constructor(daysSince, url, tsType, msu, frequency = 0) {
    this.daysSinceOptIn = daysSince;
    this.url = url;
    this.xpath = tsType;
    this.mostSignificantUnit = msu;
    this.frequency = frequency;
    this.distanceStats = new RunningStats();
  }

  inc(distance) {
    this.frequency++;
    if (Number.isFinite(distance)) { // Ingore Infinite distances (no neighbours)
      this.distanceStats.update(distance);
    }
  }

  matches(other) {
    return (
      this.daysSinceOptIn == other.daysSinceOptIn &&
      this.url == other.url &&
      this.xpath == other.xpath &&
      this.mostSignificantUnit == other.mostSignificantUnit
    );
  }

  toReportFormat() {
    let report = {
      daysSinceOptIn: this.daysSinceOptIn,
      url: this.url,
      xpath: this.xpath,
      mostSignificantUnit: this.mostSignificantUnit,
      frequency: this.frequency
    };
    // include distance stats if
    // - timestamp has siblings (and distances), and
    // - timestamp has been unredacted more than once (to report a stddev)
    if (this.distanceStats.count > 1) {
      report.distanceStats = {
        mean: Math.round(this.distanceStats.mean),
        stddev: Math.round(this.distanceStats.std),
      };
    }
    return report;
  }

  static from(json) {
    let record = Object.assign(new MsuChoiceRecord(), json);
    record.distanceStats = Object.assign(new RunningStats(), record.distanceStats);
    return record;
  }
}

class Report {
  constructor(partId) {
    this.participantIdentifier = partId;
    this.entries = [];
  }
}

// Random participant identifier
function generateParticipantId() {
  return uuidv4();
}

// Init study
// - generate participant id if not set
// - set opt-in date
export function initStudy() {
  console.log("Init Study");
  return browser.storage.local.get([
    "studyParticipantId",
    "studyOptInDate",
  ])
  .then((res) => {
    let partId = res.studyParticipantId;
    let optInDate = res.studyOptInDate;
    let dirty = false;

    if (partId === undefined) {
      partId = generateParticipantId();
      console.log(`New participant id: ${partId}`);
      dirty = true;
    }
    if (res.studyOptInDate === undefined) {
      optInDate = DateTime.utc().toFormat("yyyy-MM-dd");
      console.log(`New opt-in date: ${optInDate}`);
      dirty = true;
    }

    if (dirty) {
      return browser.storage.local.set({
          studyParticipantId: partId,
          studyOptInDate: optInDate,
      });
    }
  })
  .catch((error) => console.error(error));
}

export function clearStudyData() {
  return browser.storage.local.remove([
    "msuChoices",
    "studyLastReport",
    "studyParticipantId",
    "studyOptInDate",
    "viewCounts",
  ])
  .catch((error) => console.error(error));
}

export function resetStudyData() {
  clearStudyData()
  .then(() => initStudy())
  .catch((error) => console.error(error));
}

export function calcDaysSince(date, reference) {
  let refDate;
  if (reference === undefined) {
    refDate = DateTime.utc();
  } else {
    refDate = DateTime.fromFormat(reference, "yyyy-MM-dd");
  }
  let datetime = DateTime.fromFormat(date, "yyyy-MM-dd");
  return -Math.trunc(datetime.diff(refDate, "days").days);
}

export function updateStudyData(urlType, tsType, msu, distance) {
  // increment counter in local storage area
  return browser.storage.local.get([
    "msuChoices",
    "studyOptInDate", // to calc daysSince
  ])
  .then((res) => {
    if (res.msuChoices === undefined) {
      res.msuChoices = [];
    }

    let daysSince = calcDaysSince(res.studyOptInDate);
    let newChoice = new MsuChoiceRecord(daysSince, urlType, tsType, msu);

    // reuse existing matching choice or add new one
    let msuChoices = Array.from(res.msuChoices, MsuChoiceRecord.from);
    let matchingRecord = msuChoices.find(newChoice.matches, newChoice);
    if (matchingRecord === undefined) {
      msuChoices.push(newChoice);
      matchingRecord = newChoice;
    }

    // increment choice frequency
    matchingRecord.inc(distance);

    // store updated stats
    return browser.storage.local.set({ msuChoices: msuChoices });
  })
  .catch((error) => console.error(error));
}

export function updateViewCount(urlType) {
  // increment counter in local storage area
  return browser.storage.local.get([
    "studyOptInDate", // to calc daysSince
    "viewCounts",
  ])
  .then((res) => {
    let daysSince = calcDaysSince(res.studyOptInDate);
    let viewCounts = res.viewCounts;
    if (viewCounts === undefined) {
      viewCounts = {};
    }

    if (!viewCounts.hasOwnProperty(daysSince)) {
      viewCounts[daysSince] = {};
    }
    if (!viewCounts[daysSince].hasOwnProperty(urlType)) {
      viewCounts[daysSince][urlType] = 0;
    }
    viewCounts[daysSince][urlType]++;

    // store updated counts
    return browser.storage.local.set({ viewCounts: viewCounts });
  })
  .catch((error) => console.error(error));
}

export function buildReport(firstDay = 0, untilDay = Infinity) {
  return browser.storage.local.get([
    "msuChoices",
    "studyParticipantId",
    "viewCounts",
  ])
  .then((result) => {
    let msuChoices = result.msuChoices;
    let partID = result.studyParticipantId;
    let vcs = result.viewCounts;
    let report = {
      participantIdentifier: partID,
      viewCounts: {}
    };

    if (msuChoices === undefined) {
      msuChoices = [];
    }

    // filter out entries before firstDay
    let allEntries = Array.from(msuChoices, MsuChoiceRecord.from);
    let newEntries = allEntries.filter((e) => dayInRange(e.daysSinceOptIn, firstDay, untilDay));
    report.entries = newEntries.map((e) => e.toReportFormat());

    // filter out view counts
    for (var day in vcs) {
      if (vcs.hasOwnProperty(day)) {
        if (dayInRange(day, firstDay, untilDay)) {
            report.viewCounts[day] = vcs[day];
        }
      }
    }

    return report;
  })
  .catch((error) => console.error(error));
}

function dayInRange(day, since, until) {
  return day >= since && day < until;
}

export function sendReport() {
  // study is disabled
  console.error("Study discontinued");
}


export function requestDeletion() {
  console.error("Study discontinued");
}
