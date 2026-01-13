import { Coord } from '../core/geometry/base';
import { streetWasRunStrict } from '../core/geometry/geometry_strict';
import { Street } from './matcher_kdtree';

export type StravaActivity = {
  id: number;
  name: string;
  map: { summary_polyline: string | null };
};

export async function markStreetsRunByActivitiesAsync(
  streetsInput: Street[],
  activities: (StravaActivity & { decoded: Coord[] })[],
  toleranceMeters = 8
): Promise<Street[]> {

  const updated: Street[] = [];

  for (let i = 0; i < streetsInput.length; i++) {
    const street = streetsInput[i];

    const wasRun = activities.some(act => {
      if (!act.decoded.length) {
        console.log(`Activity ${act.id} has no decoded coords.`);
        return false;
      }

      console.log(`Checking street ${street.id} against activity ${act.id}...`);

      // return streetWasRun(street.coords, act.decoded, toleranceMeters);
      return streetWasRunStrict(street.coords, act.decoded, toleranceMeters);
    });

    updated.push({ ...street, completed: wasRun });
    console.log(`Processed street ${i + 1}/${streetsInput.length} (${street.id}): completed=${wasRun}`);
  }

  return updated;
}


