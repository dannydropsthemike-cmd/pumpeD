# pD Training Log

A minimal workout tracker that runs as a static website. It uses plain HTML, CSS, and JavaScript; there is no build step, framework, account, or server-side data store.

The app starts with **no workout plan loaded**. Import [`hypertrophy-routine.json`](./hypertrophy-routine.json) to load the five-day gym split, with Tuesday and Thursday set as rest days. [`routine.example.json`](./routine.example.json) is a separate sample format reference.

## Run it

Open `index.html` in a browser, or serve this folder with any static web server. To publish with GitHub Pages, push the repository and choose **Settings → Pages → Deploy from a branch**, then select the branch and the repository root. The app uses relative asset paths, so it also works when GitHub Pages serves it from a project subdirectory.

For the most reliable local-storage behavior, use a local static server instead of opening the file directly (for example, `python -m http.server 8000`) and visit `http://localhost:8000`.

## Included features

- Home, Workout, and Progress screens with a responsive layout.
- A rolling 27-day activity chart, training-day consistency, sick-day markers, recent sessions, and streak.
- Per-set checkoffs; exercise completion and workout completion; weight logging and editable sets/reps.
- A weight history line chart for each exercise with logged weight.
- Sick-day marking that preserves the streak without counting as a completed workout.
- JSON routine import, complete data backup export, and backup restore.
- Local browser storage. Data is private to that browser and device until exported.
- A black-background, white pumpeD SVG app icon and web app manifest.
- No workouts are preloaded; import the included gym routine or your own plan to begin.

## Upload a routine

Choose **Import routine** from Home, Workout settings, or Progress and select a JSON file. The expected shape is shown in [`routine.example.json`](./routine.example.json). A routine contains a `workouts` array, each with an `id`, `name`, and `exercises`; each exercise has a `name`, `sets`, and `reps`. The optional `schedule` maps JavaScript weekday numbers (`0` Sunday through `6` Saturday) to workout IDs or `"rest"`.

```json
{
  "name": "My plan",
  "schedule": { "0": "rest", "1": "upper", "2": "lower", "3": "rest", "4": "upper", "5": "lower", "6": "rest" },
  "workouts": [
    { "id": "upper", "name": "Upper body", "focus": "Push and pull", "exercises": [
      { "id": "bench", "name": "Bench press", "sets": 3, "reps": "8–10", "rest": "90 sec" }
    ] },
    { "id": "lower", "name": "Lower body", "exercises": [
      { "id": "squat", "name": "Squat", "sets": 4, "reps": "6–8" }
    ] }
  ]
}
```

Exercise IDs should stay stable if you update a routine; weight history is associated with the exercise ID. Importing a routine replaces the current plan and keeps the workout log. Importing a backup replaces both the plan and log.

## Backup and privacy

Use **Export backup** to download a JSON file containing your routine, workout history, exercise settings, and unit preference. Store that file somewhere safe, then use **Import backup** in a newer copy of the app to restore it. The app does not send workout data anywhere. Google Fonts are loaded from Google when network access is available; the rest of the app works as static local assets.
