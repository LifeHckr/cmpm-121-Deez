// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";
import { Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

const playerIconURL = import.meta.resolve("../static/tile_0085.png");
const cacheIconURL = import.meta.resolve("../static/tile_0089.png");

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 4;
const CACHE_SPAWN_PROBABILITY = .1;

const initLoc = leaflet.latLng(36.98949379578401, -122.06277128548504);
let playerLoc = initLoc;
const playerIcon = leaflet.icon({
  iconUrl: playerIconURL,
  tooltipAnchor: [-16, 16],
});
const playerMarker = leaflet.marker(playerLoc, { icon: playerIcon });
const emptyInven: string = "Inventory empty. Go out there and get some coins!";
const inventoryChanged: Event = new CustomEvent("inventory-changed");
const playerMoved: Event = new CustomEvent("player-moved");

interface Tile {
  i: number;
  j: number;
}
const gameMap = leaflet.map(document.getElementById("map")!, {
  center: initLoc,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
  dragging: false,
  keyboard: false,
  closePopupOnClick: false,
});
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(gameMap);
document.addEventListener("player-moved", () => {
  updateCaches();
});

interface Coin {
  i: number;
  j: number;
  serial: number;
}
let playerCoins: Coin[];
const inventoryDiv = document.querySelector<HTMLDivElement>("#statusPanel")!; // element `statusPanel` is defined in index.html
inventoryDiv.addEventListener("inventory-changed", () => {
  updateInventoryDiv();
});

const cacheToMomento = function (this: Cache): string {
  return JSON.stringify(this);
};

function cacheFromMemento(str: string): Cache {
  return JSON.parse(str);
}

interface Cache {
  i: number;
  j: number;
  inventory: Coin[];
  curSerial: number;

  toMemento(): string;
}

let cacheCache: Map<string, string>;
const currentCaches: Map<Tile, [Marker, Cache]> = new Map<
  Tile,
  [Marker, Cache]
>();
const cacheIcon = leaflet.icon({
  iconUrl: cacheIconURL,
  tooltipAnchor: [-16, 16],
  popupAnchor: [16, 16],
});

document.querySelector<HTMLButtonElement>("#reset")!
  .addEventListener("click", () => {
    gameMap.closePopup();
    initialize();
  });

document.querySelector<HTMLButtonElement>("#north")!
  .addEventListener("click", () => {
    panPlayerTo({ i: playerLoc.lat + TILE_DEGREES, j: playerLoc.lng });
  });

document.querySelector<HTMLButtonElement>("#south")!
  .addEventListener("click", () => {
    panPlayerTo({ i: playerLoc.lat - TILE_DEGREES, j: playerLoc.lng });
  });

document.querySelector<HTMLButtonElement>("#west")!
  .addEventListener("click", () => {
    panPlayerTo({ i: playerLoc.lat, j: playerLoc.lng - TILE_DEGREES });
  });

document.querySelector<HTMLButtonElement>("#east")!
  .addEventListener("click", () => {
    panPlayerTo({ i: playerLoc.lat, j: playerLoc.lng + TILE_DEGREES });
  });

function initialize() {
  currentCaches.forEach((marker, tile) => {
    marker[0].removeFrom(gameMap);
    currentCaches.delete(tile);
  });
  cacheCache = new Map<string, string>();

  playerMarker.bindTooltip("That's you!");
  playerMarker.addTo(gameMap);
  playerCoins = [];
  inventoryDiv.innerHTML = emptyInven;

  updateCaches();
}

initialize();

function newCache(tile: Tile): Cache {
  return {
    inventory: [],
    curSerial: 0,
    i: tile.i,
    j: tile.j,
    toMemento: cacheToMomento,
  };
}

function getLocalTile(LatLng: { lat: number; lng: number }): Tile {
  const i: number = Math.round(LatLng.lat / TILE_DEGREES);
  const j: number = Math.round(LatLng.lng / TILE_DEGREES);
  return { i, j };
}

function localTiles(LatLng: { lat: number; lng: number }): Tile[] {
  const result: Tile[] = [];
  const local_tile = getLocalTile(LatLng);
  for (
    let i = local_tile.i - NEIGHBORHOOD_SIZE + 1;
    i < local_tile.i + NEIGHBORHOOD_SIZE;
    i++
  ) {
    for (
      let j = local_tile.j - NEIGHBORHOOD_SIZE + 1;
      j < local_tile.j + NEIGHBORHOOD_SIZE;
      j++
    ) {
      result.push({ i: i, j: j });
    }
  }
  return result;
}

function panPlayerTo(latLng: { i: number; j: number }) {
  playerLoc = leaflet.latLng(latLng.i, latLng.j);
  gameMap.panTo(playerLoc);
  playerMarker.setLatLng(playerLoc);
  document.dispatchEvent(playerMoved);
}

function getCoinLabel(coin: Coin) {
  const result: string = `${coin.i}:${coin.j}#${coin.serial}`;
  return result;
}

function transferCoin(from: Coin[], to: Coin[], coin: Coin) {
  const index = from.indexOf(coin);
  if (index > -1) {
    from.splice(index, 1);
  }
  to.push(coin);
  inventoryDiv.dispatchEvent(inventoryChanged);
}

function mintCoins(cache: Cache, amount: number): void {
  for (let k = 0; k < amount; k++) {
    cache.inventory.push({ i: cache.i, j: cache.j, serial: cache.curSerial });
    cache.curSerial++;
  }
}

function updateCaches() {
  // Look around the player's neighborhood for caches to spawn
  const newCaches: Tile[] = []; //Caches that need to be rendered
  for (const tile of localTiles(playerLoc)) {
    if (luck([tile.i, tile.j].toString()) < CACHE_SPAWN_PROBABILITY) {
      newCaches.push(tile);
    }
  }
  currentCaches.forEach((marker, tile) => { //remove caches outside bounds
    if (newCaches.indexOf(tile) === -1) {
      marker[0].removeFrom(gameMap);
      cacheCache.set([tile.i, tile.j].toString(), marker[1].toMemento());
      currentCaches.delete(tile);
    }
  });

  newCaches.filter(function (tile: Tile): boolean {
    return !currentCaches.has(tile); //For tiles in newCaches, but not in currenCaches, spawn
  }).map(function (tile: Tile) {
    spawnCache(tile);
  });
}

function spawnCache(tile: Tile) {
  const key: string = [tile.i, tile.j].toString();
  let cache: Cache;
  if (!cacheCache.get(key)) {
    cache = newCache(tile);
    const cacheCoins = Math.floor(
      luck([cache.i, cache.j, "randombullshitgo"].toString()) * 2 + 1,
    );
    mintCoins(cache, cacheCoins);
    cacheCache.set(key, cache.toMemento());
  } else {
    cache = cacheFromMemento(cacheCache.get(key)!);
    cache.toMemento = cacheToMomento;
  }
  const location = leaflet.latLng(
    cache.i * TILE_DEGREES,
    cache.j * TILE_DEGREES,
  );
  const cacheMarker = leaflet.marker(location, { icon: cacheIcon });
  cacheMarker.addTo(gameMap);

  cacheMarker.bindPopup(() => {
    const popupDiv = document.createElement("div");
    return updateCachePopup(popupDiv, cache);
  });

  currentCaches.set(tile, [cacheMarker, cache]);
}

function updateInventoryDiv() {
  if (playerCoins.length < 1) {
    inventoryDiv.innerHTML = emptyInven;
    return;
  }
  inventoryDiv.innerHTML = "Inventory: ";
  for (const coin of playerCoins) {
    const buttonDiv = document.createElement("div");
    buttonDiv.innerHTML = `Coin: ${getCoinLabel(coin)}`;
    inventoryDiv.append(buttonDiv);
  }
}

function updateCachePopup(popupDiv: HTMLDivElement, cache: Cache) {
  popupDiv.innerHTML = `<div>Cache: ${cache.i},${cache.j} <br>Inventory:</div>`;

  coinSelectionMenu(cache, popupDiv);

  if (playerCoins.length > 0) {
    const depositButton = document.createElement("button");
    depositButton.innerHTML = "Deposit";
    depositButton.id = "give";
    depositButton.addEventListener("click", () => {
      if (playerCoins.length <= 0) {
        return;
      }
      depositButton.remove();
      depositMenu(cache, popupDiv);
    });
    popupDiv.appendChild(depositButton);
  }
  return popupDiv;
}

function coinSelectionMenu(
  cache: Cache,
  source: HTMLDivElement,
): HTMLDivElement {
  const invenLabel = document.createElement("div");
  cache.inventory.length > 0
    ? invenLabel.innerHTML = "Choose a coin: "
    : invenLabel.innerHTML = "Cache is empty.";

  for (const coin of cache.inventory) {
    const buttonDiv = document.createElement("div");
    buttonDiv.innerHTML = `Coin: ${getCoinLabel(coin)}  `;
    invenLabel.append(buttonDiv);

    const coinButton = document.createElement("button");
    coinButton.innerHTML = "Select";
    coinButton.addEventListener("click", () => {
      transferCoin(cache.inventory, playerCoins, coin);
      updateCachePopup(source, cache);
    });
    buttonDiv.append(coinButton);
  }
  source.append(invenLabel);
  return invenLabel;
}

function depositMenu(cache: Cache, source: HTMLDivElement): HTMLDivElement {
  const depositDiv = document.createElement("div");
  depositDiv.innerHTML = "Deposit: ";

  for (const coin of playerCoins) {
    const buttonDiv = document.createElement("div");
    buttonDiv.innerHTML = `Coin: ${getCoinLabel(coin)}  `;
    depositDiv.append(buttonDiv);

    const coinButton = document.createElement("button");
    coinButton.innerHTML = "Select";
    coinButton.addEventListener("click", () => {
      transferCoin(playerCoins, cache.inventory, coin);
      updateCachePopup(source, cache);
    });
    buttonDiv.append(coinButton);
  }
  source.append(depositDiv);
  return depositDiv;
}
