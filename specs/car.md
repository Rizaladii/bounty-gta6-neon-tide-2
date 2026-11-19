# Spec — game/src/car.js

Cars and the speedboat.

Exports createCars(scene, city, input), returning an object with:
- cars: the array of all cars (Mara's Zephyr RS plus parked ones).
- playerCar: the Zephyr RS (the car Mara starts in).
- boat: the speedboat at the harbor dock.
- stealCar(car): puts Mara in the given car; stealing a parked car raises
  the wanted level by 1.
- exitCar(): puts Mara on foot beside the car she was driving.
- nearestStealable(position, maxDistance): returns the closest parked car
  within the distance, or nothing when there is none.
- boardBoat(): puts Mara in the speedboat when she is near the harbor dock.

Behaviour:
- The Zephyr RS: low wide wedge silhouette, teal body with coral-orange
  side stripes, red underglow, multi-spoke alloy wheels, suspension bounce
  (the body dips and rises on bumps), and visible damage states (the body
  darkens and smokes as it takes damage). It is the fastest car.
- Other stealable cars, each with distinct handling: a muscle car (strong
  acceleration, wide turns), a street hatchback (nimble, slower top speed),
  a pickup (slowest but toughest), a minibus (heavy, slow, high and boxy),
  a scooter (nimble and fragile, quick acceleration, low top speed).
  Parked cars sit at the city's car spawn points in varied colors.
- Driving: W accelerates, S brakes or reverses, A/D steer. Handling differs
  per car type (the sports coupe grips and turns sharply, the pickup is
  heavy).
- The speedboat: sits at the harbor dock, boarded with F near it, steered
  like a car on the water, used for the final escape.
- Cars collide with building boxes (slide along them) and stop at the city
  edge. Headlights are on.

Depends only on scene, city, and input. Do not import police or missions.
