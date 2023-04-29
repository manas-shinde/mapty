'use strict';

const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const restBtn = document.querySelector('.btn--clear-all');
const sortBtn = document.querySelector('.btn--sort');

let map, mapEvent;

class Workout {
  date = new Date();
  id = (Date.now() + '').slice(-10);

  constructor(coords, distance, duration) {
    this.coords = coords;
    this.distance = distance; //in km
    this.duration = duration; // in min
  }
  _setDescription() {
    // prettier-ignore
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    this.description = `${this.type[0].toUpperCase()}${this.type.slice(1)} on ${
      months[this.date.getMonth()]
    } ${this.date.getDate()}
    `;
  }
}

class Running extends Workout {
  type = 'running';
  constructor(coords, distance, duration, cadence) {
    super(coords, distance, duration);
    this.cadence = cadence;
    this.type = 'running';
    this.calPace();
    this._setDescription();
  }
  calPace() {
    this.pace = this.duration / this.distance;
    return this.pace;
  }
}

class Cycling extends Workout {
  type = 'cycling';

  constructor(coords, distance, duration, elevationGain) {
    super(coords, distance, duration);
    this.elevationGain = elevationGain;
    this.type = 'cycling';
    this.calSpeed();
    this._setDescription();
  }
  calSpeed() {
    this.speed = this.distance / (this.duration / 60);
    return this.speed;
  }
}

class App {
  #map;
  #mapZoomLevel = 13;
  #mapEvent;
  #workouts = [];
  #currentLocation;

  constructor() {
    this.sorted = false;

    // Get user's position
    this._getPosition();

    // Get previous workouts from local storage if exists
    this._getLocalStorage();

    // Attach event handlers
    form.addEventListener('submit', this._newWorkout.bind(this));
    inputType.addEventListener('change', this._toggleElevationField);
    containerWorkouts.addEventListener('click', this._moveToPopup.bind(this));
    restBtn.addEventListener('click', this.reset);
    sortBtn.addEventListener('click', this._sortWorkout.bind(this));

    let lis = containerWorkouts.getElementsByTagName('li');

    console.log(lis);
    console.log(lis.length);
  }

  _sortWorkout(e) {
    e.preventDefault();

    // First make a deep copy of workout
    let CopiedWorkout = JSON.parse(JSON.stringify(this.#workouts));

    //To remove previous workout render list
    let lis = containerWorkouts.getElementsByTagName('li');
    // convert HTMLCollection to array becase HTMLCollection index update in real time once remove any element in it.
    let lisArray = Array.from(lis);
    lisArray.forEach(workout => containerWorkouts.removeChild(workout));

    if (!this.sorted) {
      // workouts.slice().sort((a, b) => a - b);
      CopiedWorkout = CopiedWorkout.sort((a, b) => a.distance - b.distance);
    }
    this.sorted = !this.sorted;

    CopiedWorkout.forEach(workout => this._renderWorkout(workout));
  }
  _getLocalStorage() {
    // Convert data from string to object
    const dataJson = JSON.parse(localStorage.getItem('workouts'));

    if (!dataJson) return;

    // To restore an object's prototype after retrieving from local storage
    const data = dataJson.map(workout => {
      if (workout.type == 'running')
        return Object.setPrototypeOf(workout, Running.prototype);

      if (workout.type == 'cycling')
        return Object.setPrototypeOf(workout, Cycling.prototype);
    });

    this.#workouts = data;

    // Render workout list only, not markers becase map may not be loaded yet.
    this.#workouts.forEach(workout => {
      this._renderWorkout(workout);
    });
  }

  _getPosition() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        this._loadMap.bind(this),
        function () {
          alert(`Couldn't able to get your location`);
        }
      );
    }
  }

  _loadMap(position) {
    console.log(position);
    const { latitude, longitude } = position.coords;
    console.log(latitude, longitude);
    console.log(`https://www.google.com/maps/@${latitude},${longitude}`);

    this.#currentLocation = [latitude, longitude];

    this.#map = L.map('map').setView(this.#currentLocation, this.#mapZoomLevel);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.#map);

    // Handling click on map
    this.#map.on('click', this._showForm.bind(this));

    toastMessage('app loaded');

    this._renderCurrentLocationMarker(this.#currentLocation);

    //IF workouts are present in workout list then only render those workout
    if (this.#workouts) {
      this.#workouts.forEach(workout => {
        this._renderWorkoutMarker(workout);
        this._drawLine(workout);
      });
    }
  }

  _renderCurrentLocationMarker(coords) {
    L.marker(coords)
      .addTo(this.#map)
      .bindPopup(
        L.popup({
          maxWidth: 250,
          minWidth: 100,
          autoClose: false,
          closeOnClick: false,
        })
      )
      .setPopupContent(`📍 Current Location`)
      .openPopup();
  }

  _showForm(mapEv) {
    this.#mapEvent = mapEv;
    form.classList.remove('hidden');
    inputDistance.focus();
  }

  _hideForm() {
    // Empty the form fields
    inputDistance.value =
      inputDuration.value =
      inputElevation.value =
      inputCadence.value =
        '';

    form.style.display = 'none';
    form.classList.add('hidden');
    setTimeout(() => {
      form.style.display = 'grid';
    }, 1000);
  }

  _toggleElevationField() {
    inputElevation.closest('.form__row').classList.toggle('form__row--hidden');
    inputCadence.closest('.form__row').classList.toggle('form__row--hidden');
  }

  _newWorkout(e) {
    const validateInput = (...inputs) =>
      inputs.every(input => Number.isFinite(input));

    const allPositive = (...inputs) => inputs.every(inp => inp > 0);

    e.preventDefault();

    // Get data from form
    const type = inputType.value;
    const distance = +inputDistance.value;
    const duration = +inputDuration.value;
    const { lat, lng } = this.#mapEvent.latlng;
    let workout;

    // If workout running, create running object
    if (type === 'running') {
      const cadence = +inputCadence.value;

      if (
        !validateInput(distance, duration, cadence) ||
        !allPositive(distance, duration, cadence)
      )
        return alert('Input have to be positive number!');

      workout = new Running([lat, lng], distance, duration, cadence);
    }

    // If workout cycling, create cycling object
    if (type === 'cycling') {
      const elevation = +inputElevation.value;
      console.log(`inside 2nd if...`);
      if (
        !validateInput(distance, duration, elevation) ||
        !allPositive(distance, duration)
      )
        return alert('Input have to be positive number!');

      workout = new Cycling([lat, lng], distance, duration, elevation);
    }

    // Add new object to workout array

    this.#workouts.push(workout);

    // render workout on map marker
    this._renderWorkoutMarker(workout);

    // render workout on list
    this._renderWorkout(workout);

    // To draw line from current location to workout location
    this._drawLine(workout);

    // Hide the form that used to get the data from user for workout
    this._hideForm();

    console.log(workout);
    // Store the new workout data in local storage
    this._setLocalStorage();
  }

  _setLocalStorage() {
    localStorage.setItem('workouts', JSON.stringify(this.#workouts));
  }
  _renderWorkoutMarker(workout) {
    L.marker(workout.coords)
      .addTo(this.#map)
      .bindPopup(
        L.popup({
          maxWidth: 250,
          minWidth: 100,
          autoClose: false,
          closeOnClick: false,
          className: `${workout.type}-popup`,
        })
      )
      .setPopupContent(
        `${workout.type == 'running' ? '🏃‍♂️' : '🚴‍♀️'} ${workout.description}`
      )
      .openPopup();
  }

  _drawLine(workout) {
    // Get the value of the --color-brand--1 variable
    let colorBrand1 = getComputedStyle(
      document.documentElement
    ).getPropertyValue('--color-brand--1');

    // Get the value of the --color-brand--2 variable
    let colorBrand2 = getComputedStyle(
      document.documentElement
    ).getPropertyValue('--color-brand--2');

    // Create a Polyline between the two points with a dotted style
    let dottedLine = L.polyline([this.#currentLocation, workout.coords], {
      dashArray: '5, 10', // Set the line to a dotted pattern with a 5px dash followed by a 10px gap
      color: `${workout.type === 'running' ? colorBrand2 : colorBrand1}`, // Set the color of the line based on workout type
    });

    // Add the dotted line to the map
    dottedLine.addTo(this.#map);
  }

  _renderWorkout(workout) {
    let html = `
    <li class="workout workout--${workout.type}" data-id=${workout.id}>
      <h2 class="workout__title">${workout.description}</h2>
      <div class="workout__details">
        <span class="workout__icon">${
          workout.type == 'running' ? '🏃‍♂️' : '🚴‍♀️'
        }</span>
        <span class="workout__value">${workout.distance}</span>
        <span class="workout__unit">km</span>
      </div>
      <div class="workout__details">
        <span class="workout__icon">⏱</span>
        <span class="workout__value">${workout.duration}</span>
        <span class="workout__unit">min</span>
      </div>`;

    if (workout.type == 'running')
      html += `
      <div class="workout__details">
      <span class="workout__icon">⚡️</span>
      <span class="workout__value">${workout.pace.toFixed(1)}</span>
      <span class="workout__unit">min/km</span>
    </div>
    <div class="workout__details">
      <span class="workout__icon">🦶🏼</span>
      <span class="workout__value">${workout.cadence}</span>
      <span class="workout__unit">spm</span>
    </div>
  </li>`;

    if (workout.type === 'cycling') {
      html += `
      <div class="workout__details">
      <span class="workout__icon">⚡️</span>
      <span class="workout__value">${workout.speed.toFixed(1)}</span>
      <span class="workout__unit">min/km</span>
    </div>
    <div class="workout__details">
            <span class="workout__icon">⛰</span>
            <span class="workout__value">${workout.elevationGain}</span>
            <span class="workout__unit">m</span>
          </div>
  </li>`;
    }
    form.insertAdjacentHTML('afterend', html);
  }

  _moveToPopup(e) {
    if (!this.#map) return;

    const workoutElement = e.target.closest('.workout');

    if (!workoutElement) return;

    const workout = this.#workouts.find(
      workout => workout.id == workoutElement.dataset.id
    );

    this.#map.setView(workout.coords, this.#mapZoomLevel, {
      animation: true,
      pan: { duration: 1 },
    });
  }

  reset() {
    localStorage.removeItem('workouts');
    toastMessage('Removed all the workouts from the storage!');
    location.reload();
  }
}

const app = new App();

function toastMessage(msg) {
  const toastContainer = document.createElement('div');
  toastContainer.classList.add('toast-container');
  const toastText = document.createElement('p');
  toastText.classList.add('toast-text');
  toastText.textContent = `${msg}`;
  toastContainer.append(toastText);
  document.querySelector('body').append(toastContainer);
  setTimeout(() => {
    toastContainer.remove();
  }, 1500);
}
