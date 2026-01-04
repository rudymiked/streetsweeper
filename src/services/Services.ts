export type StravaActivity = {
    id: number;
    name: string;
    distance: number;
    moving_time: number;
    elapsed_time: number;
    start_date: string;
    polyline?: string;
    // add more fields as needed
};

export async function loadAllActivities(
    accessToken: string
): Promise<StravaActivity[]> {
    try {
        let page = 1;
        const perPage = 200;
        const all: StravaActivity[] = [];

        while (true) {
            const res = await fetch(
                `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );

            console.log(`Fetching Strava activities page ${page}`);

            if (!res.ok) {
                throw new Error(`Strava API error: ${res.status}`);
            }

            const data: StravaActivity[] = await res.json();

            if (data.length === 0) break;

            all.push(...data);
            page++;
        }

        return all;
    } catch (err: any) {
        throw new Error(`Failed to load activities: ${err.message}`);
    }
}
