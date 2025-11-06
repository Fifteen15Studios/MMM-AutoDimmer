// MMM-AutoDimmer.js

Module.register("MMM-AutoDimmer", {
	// Default module config
	defaults: {
		schedules: [
			{
				days: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
				maxDim: 0.9,
				transitionDuration: 10 * 60 * 1000,
				transitionSteps: 20,
				brightTime: 700,
				dimTime: 2000,
				notificationTriggers: undefined
			}
		]
	},

	// get current date and time for displaying in log
	getDateTime: function() {
		var currentdate = new Date();
		var minute = currentdate.getMinutes();
		if(minute < 10) {
			minute = "0" + minute;
		}
		var second = currentdate.getSeconds();
		if(second < 10) {
			second = "0" + second;
		}
		return currentdate.getFullYear() + "/"
						+ (currentdate.getMonth()+1)  + "/"
						+ currentdate.getDate() + " "
						+ currentdate.getHours() + ":"
						+ minute + ":"
						+ second;
	},

	getStartOfLog : function() {
		return this.getDateTime() + ": " + this.name + ": ";
	},

	// get value of variable, or default value for a variable if value is not set
    getVar: function(variable, defaultVal) {
        if (typeof variable === 'undefined') {
            return defaultVal;
        }
        else {
            return variable;
        }
    },

	start: function() {

		var self = this;

		self.home = -1;

		self.overlay = null;
		self.initialRun = true; // Only true when MM is first loaded
		let mySchedules = new Array(0);
		now = new Date();

		self.config.schedules.forEach((configSchedule) => {

			// Set each value to config value, or default if config value is missing
			var dimTime = self.getVar(configSchedule.dimTime, 2000);
			var brightTime = self.getVar(configSchedule.brightTime, 700);
			var maxDim = self.getVar(configSchedule.maxDim, 0.9);
			var transitionSteps = self.getVar(configSchedule.transitionSteps, 20);
			var transitionDuration = self.getVar(configSchedule.transitionDuration, 10 * 60 * 1000);
			var days = self.getVar(configSchedule.days, ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]);

			// Set timeToDim based on value in config file
			var timeToDim = new Date();
			timeToDim.setHours(Math.floor(dimTime / 100), Math.floor(dimTime % 100), 0, 0);

			var timeToBrighten = new Date();
			timeToBrighten.setHours(Math.floor(brightTime / 100), Math.floor(brightTime % 100), 0, 0);

			// If it's after brightTime, and this schedule dims overnight
			if(now.getTime() > timeToBrighten.getTime() && dimTime > brightTime) {
				timeToBrighten.setDate(now.getDate() + 1);
			}

			// If should be in a dim time that started yesterday, set timeToDim to yesterday
			if((now.getHours() < Math.floor(dimTime / 100) || (now.getHours() == Math.floor(dimTime / 100) && now.getMinutes() < Math.floor(dimTime % 100))) &&
				now.getTime() > timeToBrighten.getTime()) {
				timeToDim.setDate(now.getDate() - 1);
			}

			opacityStep = maxDim / transitionSteps;

			let schedule = {
				"days": days,
				"dimTime": dimTime,
				"brightTime": brightTime,
				"timeToDim": timeToDim,
				"timeToBrighten": timeToBrighten,
				"maxDim": maxDim,
				"transitionSteps": transitionSteps,
				"transitionDuration": transitionDuration,
				"opacityStep": opacityStep,
				"notificationTriggers": configSchedule.notificationTriggers,
				"triggerSatisfied": undefined,
				"mode": "Dormant"
			}

			mySchedules.push(schedule);
		});

		self.mySchedule = mySchedules;
	},

	notificationReceived: function(notification, payload, sender) {
		var self = this;

		var somethingChanged = false;

		// Search through schedules to see if they should trigger on this notification
		self.mySchedule.forEach((schedule) => {
			// if no notification on this schedule, move to the next
			if(schedule.notificationTriggers !== undefined) {

				var origValue = schedule.triggerSatisfied;
				var triggerSatisfied = false;
				var nameSame = false;

				schedule.notificationTriggers.forEach((trigger) => {
					// Check If this notification matches this schedule's trigger
					if(trigger.name == notification) {
						schedule.triggerSatisfied = undefined;
						nameSame = true;

						console.log(self.getStartOfLog() + "Trigger check. NotificationName: " + notification + " Notification Value: " + payload);
						// Set trigger to satisfied if notification vaue matches trigger value
						if(trigger.value == payload) {
							console.log(self.getStartOfLog() + "Trigger satisfied.");
							schedule.triggerSatisfied = true;
							triggerSatisfied = true;
							// If the value changed
							if(origValue === undefined || origValue === false) {
								somethingChanged = true;
							}
						}
					}
				});

				// Set trigger to not satisfied if notification vaue matches trigger value
				if(!triggerSatisfied && nameSame === true) {
					schedule.triggerSatisfied = false;
					if(origValue === true) {
						somethingChanged = true;
					}
				}
			}
		});

		// Update screen if a trigger changed
		if(somethingChanged) {
			self.updateDom();
		}
	},

	socketNotificationReceived: function (notification, payload) {
		// Do Nothing
	},

	setNextDay: function(schedule) {
		var now = new Date();

		// If time already passed, reset for tomorrow
		while(schedule.timeToBrighten.getTime() <= now.getTime()) {
			schedule.timeToBrighten.setDate(schedule.timeToBrighten.getDate() + 1);

			//While time to dim is in the past
			while(schedule.timeToDim.getTime() <= now.getTime()) {
				schedule.timeToDim.setDate(schedule.timeToDim.getDate() + 1);
			}
		}
	},

	setNextUpdate: function(newValue) {
		// Only set if it's not already set or smaller than the current value, but also greater than 0
		if((newValue < this.nextUpdate || this.nextUpdate == 0) && newValue > 0) {
			this.nextUpdate = newValue;
		}
	},

	// Find the next time any schedule will dim
	findNextDim: function() {
		var nextDimTime = -1;
		var now = new Date();
		var self = this;

		self.mySchedule.forEach((schedule) => {
			if(now > schedule.timeToBrighten.getTime()) {
				self.setNextDay(schedule);
			}

			var startToDim = schedule.timeToDim.getTime() - schedule.transitionDuration;

			if((startToDim - now.getTime() < nextDimTime && startToDim - now.getTime() > 0 || nextDimTime === -1) && startToDim - now.getTime() > 0) {
				nextDimTime = startToDim - now.getTime();
			}
		});

		console.log(self.getStartOfLog() + "nextDimTime: " + nextDimTime);

		return nextDimTime;
	},

	// Find the next time a schedule will brighten the screen
	findNextBright: function() {
		var nextBrightTime = -1;

		var now = new Date();

		var self = this;

		self.mySchedule.forEach((schedule) => {
			self.setNextDay(schedule);
			var startToBright = schedule.timeToBrighten.getTime() - schedule.transitionDuration;

			if((startToBright - now.getTime() < nextBrightTime|| nextBrightTime === -1) && startToBright - now.getTime() > 0) {
				nextBrightTime = startToBright - now.getTime();
			}
		});

		console.log(self.getStartOfLog() + "nextBrightTime: " + nextBrightTime);

		return nextBrightTime;
	},

	// Set the opacity of the screen, but only if it's dimmer than the current setting.
	// This ensures that the dimmest active schedule takes precedence.
	setOpacity: function(opacity) {
		if(this.opacity < opacity) {
			this.opacity = opacity;
		}
	},

	// Starts to dim the screen
	setDim: function(schedule) {
		var self = this;
		console.log(self.getStartOfLog() + 'Dim');

		var now = new Date();

		var startToBrighten = schedule.timeToBrighten.getTime() - schedule.transitionDuration;
		var startToDim = schedule.timeToDim.getTime() - schedule.transitionDuration;

		if(schedule.notificationTriggers !== undefined && schedule.triggerSatisfied === false) {
			console.log(self.getStartOfLog() + "Notification trigger not satisfied, so skipping this schedule.");
			schedule.mode = "Dormant";
			return;
		}

		if(self.opacity < schedule.maxDim) {
			if(schedule.dimTime == schedule.brightTime) {
				// Set to check tomorrow at midnight to see if it's scheduled that day
				var tomorrow = new Date();
				tomorrow.setDate(tomorrow.getDate() + 1);
				tomorrow.setHours(0, 0, 0, 0);

				self.setNextUpdate(tomorrow.getTime() - now.getTime());
				schedule.mode = "Dim";
				self.setOpacity(schedule.maxDim);
			}
			// If started up past dim time
			else if(now.getTime() > schedule.timeToDim.getTime()) {
				self.setNextUpdate(startToBrighten - now.getTime());
				schedule.mode = "Dim";
				self.setOpacity(schedule.maxDim);
			}
			// If there is a transition time
			else if(schedule.transitionDuration > 0) {

				// Length of each transition step
				stepLength = schedule.transitionDuration / schedule.transitionSteps;
				// How far, in milliseconds, are we past when we started to dim
				millisPastStart = now.getTime() - startToDim;
				// How many steps have passed since we started to dim
				stepsIn = Math.floor(millisPastStart / stepLength);
				// How much time is left in the current step before moving to the next step. Should be stepLength unless loaded during transition period.
				remainder = millisPastStart % stepLength;

				self.setNextUpdate(stepLength - remainder);
				self.setOpacity(schedule.opacityStep * stepsIn);
				schedule.mode = "Dimming";

				if(self.opacity > schedule.maxDim) {
					self.setOpacity(schedule.maxDim);
				}
			}
			// Set to fully dim immediately
			else {
				self.setNextUpdate(startToBrighten - now.getTime());
				schedule.mode = "Dim";
				self.setOpacity(schedule.maxDim);
			}
		}
		else {
			self.setNextUpdate(startToBrighten - now.getTime());
			schedule.mode = "Dim";
			self.setOpacity(schedule.maxDim);
		}
	},

	// Starts to brighten the screen
	setBright: function(schedule) {
		var self = this;

		var now = new Date();

		console.log(self.getStartOfLog() + 'Bright');

		if(schedule === null) {
			return;
		}
		// If schedule shouldn't be triggering anymore, based on notification setting, return to bright immediately
		else if(schedule.triggerSatisfied !== undefined && !schedule.triggerSatisfied){
			console.log(self.getStartOfLog() + 'Setting fully Bright');
			// Set to fully bright immediately
			self.setOpacity(0);
			schedule.mode = "Dormant";

			return;
		}
		// If there is a transition time
		else if(schedule.transitionDuration > 0) {
			var startToBrighten = schedule.timeToBrighten.getTime() - schedule.transitionDuration;
			var startToDim = schedule.timeToDim.getTime() - schedule.transitionDuration;

			// Length of each transition step
			stepLength = schedule.transitionDuration / schedule.transitionSteps;
			// How far, in milliseconds, are we past when we started to brighten
			millisPastStart = now - startToBrighten;
			// How many steps have passed since we started to brighten
			stepsIn = Math.floor(millisPastStart / stepLength);
			// How much time is left in the current step before moving to the next step. Should be stepLength unless loaded during transition period.
			remainder = millisPastStart % stepLength;

			self.setNextUpdate(stepLength - remainder);
			self.setOpacity((schedule.maxDim - (schedule.opacityStep * stepsIn)));
			schedule.mode = "Brightening";

			if(self.opacity <= 0 || millisPastStart >= schedule.transitionDuration || now.getTime() >= schedule.timeToBrighten.getTime()) {
				self.setOpacity(0);
				schedule.mode = "Dormant";
				self.setNextDay(schedule);
			}
		}
		// Set to fully bright immediately
		else {
			self.setOpacity(0);
			schedule.mode = "Dormant";
			self.setNextDay(schedule);
		}
	},

	setOverlay: function() {
		var now = new Date();

		var self = this;

		if (self.overlay === null) {
			self.overlay = document.createElement("div");
			self.overlay.style.background = "#000";
			self.overlay.style.position = "fixed";
			self.overlay.style.top = "0px";
			self.overlay.style.left = "0px";
			self.overlay.style.right = "0px";
			self.overlay.style.bottom = "0px";
			self.overlay.style["z-index"] = 9999;
			self.overlay.style.opacity = 0.0;
			self.overlay.style.pointerEvents = "none";
		}

		self.opacity = 0;
		self.nextUpdate = 0;

		self.mySchedule.forEach((schedule) => {
			var startToBrighten = schedule.timeToBrighten.getTime() - schedule.transitionDuration;
			var brighten = schedule.timeToBrighten.getTime();
			var startToDim = schedule.timeToDim.getTime() - schedule.transitionDuration;
			var dim = schedule.timeToDim.getTime();

			var triggerSatisfied = false;

			if(schedule.notificationTriggers === undefined || schedule.triggerSatisfied === true) {
				schedule.mode = "Dormant";
				triggerSatisfied = true;
			}

			// List of days
			const weekday = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
			const today = weekday[now.getDay()];
			var yesterday = -2;
			if(now.getDay() <= 0) {
				yesterday = weekday[now.getDay() -1];
			}
			else {
				yesterday = weekday[6];
			}

			// If schedule is set to run today
			if(schedule.days.includes(today) || (schedule.dimTime > schedule.brightTime && schedule.days.includes(yesterday))) {
				if(triggerSatisfied) {
					if(schedule.dimTime == schedule.brightTime) {
						console.log(self.getStartOfLog() + 'Calling dim bc dimTime = brightTime, so it should always be dim');
						self.setDim(schedule);
					}
					else if (now.getTime() >= startToDim && now.getTime() < startToBrighten) {
						console.log(self.getStartOfLog() + 'Calling dim bc it\'s time to');
						self.setDim(schedule);
					}
					else if(now.getTime() > startToBrighten && now.getTime() < brighten) {
						console.log(self.getStartOfLog() + 'Calling bright bc it\'s brightening');
						self.setBright(schedule);
					}
					else {
						schedule.mode = "Dormant";
						self.setNextDay(schedule);
					}
				}
			}
			// Set to run tomorow
			else {
				schedule.mode = "Dormant";
				self.setNextDay(schedule);
			}
		});

		// find the next update time - catch all in case there are no schedules active
		self.setNextUpdate(self.findNextDim());
		self.setNextUpdate(self.findNextBright());

		// Set the overlay
		if (self.overlay === null) {
			self.overlay = document.createElement("div");
			self.overlay.style.background = "#000";
			self.overlay.style.position = "fixed";
			self.overlay.style.top = "0px";
			self.overlay.style.left = "0px";
			self.overlay.style.right = "0px";
			self.overlay.style.bottom = "0px";
			self.overlay.style["z-index"] = 9999;
			self.overlay.style.opacity = self.opacity;
		} else if (Math.abs(self.overlay.style.opacity - self.opacity) > 0.001) {
			self.overlay.style.transition = `opacity ${self.nextUpdate}ms linear`;
			self.overlay.style.opacity = self.opacity;
		}

		console.log(self.getStartOfLog() + 'Opacity: ' + self.opacity);
	},

	getDom: function() {
		var self = this;
		self.setOverlay();

		// Catch all - if next update time is less than or equal to 0, make it 3 seconds
		if(self.nextUpdate <= 0) {
			self.nextUpdate = 3000;
		}

		console.log(self.getStartOfLog() + 'self.nextUpdate: ' + self.nextUpdate);

		self.initialRun = false;

		// Set timer for next update
		setTimeout(function() { self.updateDom(); }, self.nextUpdate);

		return self.overlay;
	},
});
