// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";
// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";
// Fix missing marker images
import "./leafletWorkaround.ts";
// Deterministic random number generator
import luck from "./luck.ts";

document.title = "Don't Leave Me";

// Location of our classroom (as identified on Google Maps)
const player_loc = leaflet.latLng(36.98949379578401, -122.06277128548504);
// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

//interfaces
interface Tile {
  i: number;
  j: number;
}

// Create the map (element with id "map" is defined in index.html)
const game_map = leaflet.map(document.getElementById("map")!, {
  center: player_loc,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
  dragging: false,
  keyboard: false,
});
// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(game_map);

// Add a marker to represent the player
const playerIcon = leaflet.icon({
  iconUrl: "/project/src/static/tile_0085.png",
  tooltipAnchor: [-16, 16],
});
const playerMarker = leaflet.marker(player_loc, { icon: playerIcon });
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(game_map);

// Display the player's points
let playerCoins = 0;
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!; // element `statusPanel` is defined in index.html
statusPanel.innerHTML = "Inventory empty. Go out there and get some coins!";

// Add caches to the map by cell numbers
const cacheIcon = leaflet.icon({
  iconUrl: "/project/src/static/tile_0089.png",
  tooltipAnchor: [-16, 16],
  popupAnchor: [16, 16],
});
function spawnCache(tile: Tile) {
  // Convert cell numbers into lat/lng bounds
  const location = leaflet.latLng(
    (tile.i * TILE_DEGREES + (tile.i + 1) * TILE_DEGREES) / 2,
    (tile.j * TILE_DEGREES + (tile.j + 1) * TILE_DEGREES) / 2,
  );
  // Add a rectangle to the map to represent the cache
  const cache = leaflet.marker(location, { icon: cacheIcon });
  cache.addTo(game_map);

  // Handle interactions with the cache
  cache.bindPopup(() => {
    // Each cache has a random point value, mutable by the player
    let cacheCoins = Math.floor(
      luck([tile.i, tile.j, "initialValue"].toString()) * 100,
    );

    // The popup offers a description and button
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
                <div>There is a cache here at "${tile.i},${tile.j}". It has <span id="value">${cacheCoins}</span> coins.</div>
                <button id="take">Take</button>
                <button id="give">Deposit</button>`;

    // Clicking the button decrements the cache's value and increments the player's points
    popupDiv
      .querySelector<HTMLButtonElement>("#take")!
      .addEventListener("click", () => {
        if (cacheCoins <= 0) {
          return;
        }
        cacheCoins--;
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
          cacheCoins.toString();
        playerCoins++;
        statusPanel.innerHTML = `${playerCoins} coins!`;
      });
    //Deposit button
    popupDiv
      .querySelector<HTMLButtonElement>("#give")!
      .addEventListener("click", () => {
        if (playerCoins <= 0) {
          return;
        }
        cacheCoins++;
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
          cacheCoins.toString();
        playerCoins--;
        statusPanel.innerHTML = `${playerCoins} coins!`;
      });

    return popupDiv;
  });
}

// Look around the player's neighborhood for caches to spawn
const local_tile = getLocalTile(player_loc);
for (
  let i = local_tile.i - NEIGHBORHOOD_SIZE;
  i < local_tile.i + NEIGHBORHOOD_SIZE;
  i++
) {
  for (
    let j = local_tile.j - NEIGHBORHOOD_SIZE;
    j < local_tile.j + NEIGHBORHOOD_SIZE;
    j++
  ) {
    // If location i,j is lucky enough, spawn a cache!
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache({ i, j });
    }
  }
}

function getLocalTile(LatLng: { lat: number; lng: number }): Tile {
  const i: number = Math.floor(LatLng.lat / TILE_DEGREES);
  const j: number = Math.floor(LatLng.lng / TILE_DEGREES);
  return { i, j };
}
