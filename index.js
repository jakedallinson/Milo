// MILO

let emails = [
	"jakeallinson03@gmail.com",
	"jacobdallinson@cedarville.edu"
];

// searching for free slots
// check for emails
if (emails.length < 1) {
  console.log("no emails given");
  return;
}
// TODO: set for testing
let eventTypes = {
  breakfast: {
    start:  28800, // 8
    end:    36000, // 10
  },
  lunch: {
    start:  39600, // 11
    end:    46800, // 13
  },
  dinner: {
    start:  61200, // 17
    end:    68400, // 19
  },
}
let options = {
  accessToken:  "A8pkar8cxF2BMVX0UJhMn9s56t9N2N",
  emails:       emails,
  searchStart:  (Date.parse("05-04-2020 06:00") / 1000),
  searchEnd:    (Date.parse("05-06-2020 08:00") / 1000),
  eventType:    eventTypes["lunch"],
  dayStart:     25200, // 07 (7am)
  dayEnd:       79200, // 22 (10pm)
  lengthInSec:  3600,  // 1 hour
  numToReturn:  3
}
// send request and show results
requestFreeSlots(options, function(results) {
  console.log(results);
});

// TODO: undo this, no longer in node
function requestFreeSlots(options, callback)
{
  let url = "http://localhost:3000/schedule";
  let data = JSON.stringify(options);
  $.post(url, data, function(result) {
    callback(result);
  });
}

function masterRequest(options, callback)
{
  // merge all the busy times into an array
  makeAllFreeBusyRequests(options, function(busySlots) {

    console.log("made it");
      // sort busy times by start time (overlap)
      let sortedBusySlots = sortByStartTime(busySlots); 
      // use the array of sorted busy times to find free times (no overlap)
      let sortedFreeSlots = findFreeSlots(sortedBusySlots, start, end);
      // adjust the free slots to fall with a day
      // 7am = 25200, 10pm = 79200
      let startOfDay = 25200;
      let endOfDay = 79200;
      let adjustedFreeSlots = adjustFreeSlots(sortedFreeSlots, start, end, startOfDay, endOfDay);

      // suggest times based on length and event type
      let lengthInSeconds = 1 * 3600;
      let numToReturn = 3;
      let suggestedSlots = suggestSlots(adjustedFreeSlots, lengthInSeconds, eventTypes["lunch"], numToReturn);
      callback(suggestedSlots);
  });
}

function makeAllFreeBusyRequests(options, callback)
{
    // keep track of request made and store all busy slots
    let requested = 0;
    let timeSlots = [];
    let emails = options.emails;
    // make the requests
    for (let email in options.emails) {
      freeBusyRequest(options.accessToken, options.searchStart, options.searchEnd, emails[email], function(result) {
        let slots = result.data[0].time_slots;
        // add user's slots to the group
        for (let slot in slots) {
          // add email field to slots
          slots[slot].email = emails[email];
          timeSlots.push(slots[slot]);
        }
        // if last request, callback the time slots
        requested += 1;
        if (requested >= emails.length) {
          callback(timeSlots);
        }
      });
    }
}

function freeBusyRequest(accessToken, searchStart, searchEnd, email, callback)
{
    let url = "https://api.nylas.com/calendars/free-busy"
    // make the request with axios
    axios({
        url: url,
        method: 'post',
        headers: {'Authorization' : 'Bearer ' + accessToken},
        data : {
            start_time: searchStart,
            end_time: searchEnd,
            emails: [email]
        }
    })
    .then(function (response) {
        callback(response);
    })
    .catch(function (error) {
        console.log(error);
    });
}

function findFreeSlots(sortedBusySlots, start, end)
{
    // walk through sorted busy slots and find free slots
    // i is the furthest known end time, j is start time of current
    let i = start;
    let j;
    let freeSlots = [];
    sortedBusySlots.forEach(slot => {
        j = slot.start_time
        // look for gap between i and j
        if (i < j) {
            freeSlots.push({
                start_time: i,
                end_time: j,
                seconds: j - i
            });
        }
        // move i to further end time if needed
        if (i < slot.end_time) {
            i = slot.end_time;
        }
    });
    // check for slot between last free slot and end
    if (freeSlots[freeSlots.length - 1].end_time < end) {
        freeSlots.push({
            start_time: freeSlots[freeSlots.length - 1].end_time,
            end_time: end,
            seconds: end - freeSlots[freeSlots.length - 1].end_time
        });
    }
    return freeSlots;
}

function adjustFreeSlots(sortedFreeSlots, start, end, startOfDay, endOfDay)
{
    let adjustedFreeSlots = [];
    sortedFreeSlots.forEach(slot => {
        // first see if slot is in one day, or if it overlaps multiple days
        if (slotInSameDay(slot.start_time, slot.end_time)) {
            // SAME DAY
            // get start and end time for the current day
            let currDay = slot.start_time;
            let currDayStart = createTimestamp(currDay, startOfDay);
            let currDayEnd = createTimestamp(currDay, endOfDay);
            // adjust the slot to fit inside day
            let newSlot = adjustSlot(slot, currDayStart, currDayEnd);
            if (newSlot) {
                adjustedFreeSlots.push(newSlot);
            }
        } else {
            // NOT ON SAME DAY
            let startDay = slot.start_time;
            let endDay = slot.end_time;
            let currDay = startDay;
            while (1) {
                // get start and end time for the current day
                let currDayStart = createTimestamp(currDay, startOfDay);
                let currDayEnd = createTimestamp(currDay, endOfDay);
                let newSlot = {
                    start_time: null,
                    end_time: null,
                    seconds: null,
                };
                // check for type of day
                if (slotInSameDay(currDay, startDay)) {
                    // start day
                    if (slot.start_time < currDayStart) {
                        newSlot.start_time = currDayStart;
                    } else {
                        newSlot.start_time = slot.start_time;
                    }
                    newSlot.end_time = currDayEnd;
                    newSlot.seconds = newSlot.end_time - newSlot.start_time;
                    adjustedFreeSlots.push(newSlot);
                } else if (slotInSameDay(currDay, endDay)) {
                    // end day
                    // end must go beyond the start of the last day
                    if (slot.end_time > currDayStart) {
                        newSlot.start_time = currDayStart;
                        if (slot.end_time > currDayEnd) {
                            newSlot.end_time = currDayEnd;
                        } else {
                            newSlot.end_time = slot.end_time;
                        }
                        newSlot.seconds = newSlot.end_time - newSlot.start_time;
                        adjustedFreeSlots.push(newSlot);
                    }
                    break;
                } else {
                    // any other day
                    newSlot.start_time = currDayStart;
                    newSlot.end_time = currDayEnd;
                    newSlot.seconds = newSlot.end_time - newSlot.start_time;
                    adjustedFreeSlots.push(newSlot);
                }
                // increment curr day by one full day
                currDay += (24 * 3600);
            }
        }
    });
    return adjustedFreeSlots;
}

function suggestSlots(adjustedFreeSlots, lengthInSeconds, event, numToReturn)
{
    let suggestedFreeSlots = [];
    adjustedFreeSlots.forEach(slot => {
        if (slot.seconds >= lengthInSeconds) {
            // // convert slot into seconds since start of day
            let slotStartSeconds = getSecondsInDay(slot.start_time);
            let slotEndSeconds = getSecondsInDay(slot.end_time);
            // // loop through where i is start and j is end to create suggestions
            let i;
            let j;
            // look at start of event
            if (slotStartSeconds <= event.start) {
                i = event.start;
            } else if (slotStartSeconds < event.end) {
                i = slotStartSeconds
            }
            // look at end of event
            if (slotEndSeconds >= event.end) {
                j = event.end;
            } else if (slotEndSeconds > event.start) {
                j = slotEndSeconds
            }
            // if i and j have been set
            if (i && j) {
                // move i closer to j until no slots are available
                let currDay = slot.start_time;
                let incrementInSeconds = 15 * 60; // 15 minutes
                // priority of 1 for first suggestions, all increments get a 2
                let priority = 1;
                while (j - i >= lengthInSeconds) {
                    let newSlot = {
                        start_time: createTimestamp(currDay, i),
                        end_time: null,
                        seconds: null,
                        priority: priority,
                    };
                    newSlot.end_time = newSlot.start_time +  lengthInSeconds;
                    newSlot.seconds = lengthInSeconds;
                    suggestedFreeSlots.push(newSlot);
                    i += incrementInSeconds;
                    priority = 2;
                }
                //console.log(createTimestamp(slot.start_time, i), createTimestamp(slot.start_time, j))
            }
        }
    });
    return suggestedFreeSlots;
}

function adjustSlot(slot, currDayStart, currDayEnd)
{
    if (slot.start_time >= currDayStart && slot.end_time <= currDayEnd) {
        // slot falls within the day, so return as is
        return slot;
    } else if (slot.start_time >= currDayEnd || slot.end_time <= currDayStart) {
        // slot falls outside of day entirely
        return null;
    } else {
        // adjust the edges as needed
        let newSlot = slot;
        if (slot.start_time < currDayStart) {
            newSlot.start_time = currDayStart;
        }
        if (slot.end_time > currDayEnd) {
            newSlot.end_time = currDayEnd;
        }
        newSlot.seconds = newSlot.end_time - newSlot.start_time;
        return newSlot;
    }
}

function createTimestamp(timestamp, adjustSeconds)
{
    let date = new Date(timestamp * 1000);
    let hours = Math.floor(adjustSeconds / 3600);
    let minutes = Math.floor(adjustSeconds / 60) - (hours * 60);
    let seconds = adjustSeconds % 60;
    date.setHours(hours, minutes, seconds);
    return (Date.parse(date) / 1000);
}

function slotInSameDay(start, end)
{
    let startDate = new Date(start * 1000);
    let endDate = new Date(end * 1000);
    return (startDate.toDateString() == endDate.toDateString());
}

// helper function to sort slots by start time
function sortByStartTime(slots)
{
    return slots.sort(function(a, b) {
        let x = a.start_time;
        let y = b.start_time;
        // Compare the 2 timestamps
        if (x < y) return -1;
        if (x > y) return 1;
        return 0;
    });
}

function getSecondsInDay(timestamp)
{
    let date = new Date(timestamp * 1000);
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let seconds = date.getSeconds();
    return hours * 3600 + minutes * 60 + seconds;
}

// unix timestamp to datetime
function timestampToDatetime(timestamp)
{
    // get all the months
    let months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    // convert timestamp to milliseconds
    let date = new Date(timestamp * 1000);

    // get all parts from date
    let year = date.getFullYear();
    let month = months[date.getMonth()];
    let day = date.getDate();
    let hours = date.getHours();
    let minutes = "0" + date.getMinutes();
    let seconds = "0" + date.getSeconds();
   
    // display in yyyy mmm dd h:m:s format
    return `${year} ${month} ${day} ${hours}:${minutes.substr(-2)}:${seconds.substr(-2)}`;
}