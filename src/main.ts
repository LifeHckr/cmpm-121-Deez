// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";
import { Marker } from "leaflet";
import { LatLng } from "leaflet";
import { Polyline } from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";
//region Consts-Leaflet
const playerIconURL = import.meta.resolve("../static/tile_0085.png");
const cacheIconURL = import.meta.resolve("../static/tile_0089.png");
const initLoc = leaflet.latLng(36.98949379578401, -122.06277128548504);
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 3;
const CACHE_SPAWN_PROBABILITY = .1;
const inventoryChanged: Event = new CustomEvent("inventory-changed");
const playerMovedEvent: string = "player-moved";
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
leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(gameMap);
const messengerMarker = leaflet.marker(leaflet.latLng(0, 0));
messengerMarker.addEventListener(playerMovedEvent, () => {
  updateCaches();
});
const playerIcon = leaflet.icon({
  iconUrl: playerIconURL,
  tooltipAnchor: [-16, 16],
});
const cacheIcon = leaflet.icon({
  iconUrl: cacheIconURL,
  tooltipAnchor: [-16, 16],
  popupAnchor: [16, 16],
});
//endregion

let playerLoc = initLoc;
let realTimeLoc: boolean = false;
let geoLocWatch: number;
const playerMarker = leaflet.marker(playerLoc, { icon: playerIcon });
const emptyInvenFlavor: string =
  "Inventory empty. Go out there and get some coins!";

//region Tiles
interface Tile {
  i: number;
  j: number;
}
function isLocal(tile: Tile): boolean {
  return Math.abs(tile.i - Math.round(playerLoc.lat / TILE_DEGREES)) <=
      NEIGHBORHOOD_SIZE &&
    Math.abs(tile.j - Math.round(playerLoc.lng / TILE_DEGREES)) <=
      NEIGHBORHOOD_SIZE;
}
function localTiles(LatLng: { lat: number; lng: number }): Tile[] { //AM I A REAL TS DEV YET?!?
  const local_tile: Tile = {
    i: Math.round(LatLng.lat / TILE_DEGREES),
    j: Math.round(LatLng.lng / TILE_DEGREES),
  };
  const MAGIC_NUMBER = 2 * NEIGHBORHOOD_SIZE + 1;

  let tileIter: number = 0;
  return Array(MAGIC_NUMBER * MAGIC_NUMBER)
    .fill(local_tile, 0, MAGIC_NUMBER * MAGIC_NUMBER)
    .map((tile: Tile) => ({
      i: tile.i +
        (((tileIter % MAGIC_NUMBER) - NEIGHBORHOOD_SIZE) %
          (NEIGHBORHOOD_SIZE + 1)), //Basically a repeating -nSize -nSize+1,... 0, ... nSize
      j: tile.j + Math.floor(tileIter++ / MAGIC_NUMBER) - NEIGHBORHOOD_SIZE, // for the length of a neighborhood y val is the same, next length is y +1, etc
    }));
}
//endregion

//region Coin
interface Coin {
  i: number;
  j: number;
  serial: number;
}
function getCoinLabel(coin: Coin) {
  return `${coin.i}:${coin.j}#${coin.serial}`;
}
function transferCoin(from: Coin[], to: Coin[], coin: Coin) {
  const index = from.indexOf(coin);
  if (index <= -1) return; //error
  from.splice(index, 1);
  to.push(coin);
  inventoryDiv.dispatchEvent(inventoryChanged);
}
//endregion

let playerInven: Coin[];
function saveInven() {
  localStorage.setItem("playerInven", JSON.stringify(playerInven));
}
const playerTrail: Polyline = leaflet.polyline([]).addTo(gameMap);
const inventoryDiv = document.querySelector<HTMLDivElement>("#statusPanel")!;
inventoryDiv.addEventListener("inventory-changed", () => {
  if (playerInven.length < 1) {
    inventoryDiv.innerHTML = emptyInvenFlavor;
    return;
  }
  inventoryDiv.innerHTML = "Inventory: ";
  for (const coin of playerInven) {
    const buttonAnchor = document.createElement("a");
    buttonAnchor.innerHTML = `Coin: ${getCoinLabel(coin)} <br>`;
    buttonAnchor.onclick = () => {
      gameMap.panTo(
        leaflet.latLng(coin.i * TILE_DEGREES, coin.j * TILE_DEGREES),
      );
    };
    inventoryDiv.append(buttonAnchor);
  }
  saveInven();
});

//region Cache
interface Cache {
  i: number;
  j: number;
  inventory: Coin[];
  curSerial: number;

  toMemento(): string;
  fromMemento(str: string): Cache;
}
const cacheToMemento = function (this: Cache): string {
  return JSON.stringify(this);
};
Cache.prototype.toMemento = cacheToMemento;
const cacheFromMemento = function (str: string): Cache {
  const tempCache = JSON.parse(str);
  const resCache = Cache();
  resCache.i = tempCache.i;
  resCache.j = tempCache.j;
  resCache.inventory = tempCache.inventory;
  return resCache;
};
Cache.prototype.fromMemento = cacheFromMemento;

function Cache(): Cache;
function Cache(cacheLike: Tile): Cache;
function Cache(
  cacheLike:
    | { i: number; j: number; curSerial: number; inventory: Coin[] }
    | Tile
    | void,
): Cache {
  if (!cacheLike) {
    return {
      inventory: [],
      curSerial: 0,
      i: 0,
      j: 0,
      toMemento: cacheToMemento,
      fromMemento: cacheFromMemento,
    };
  } else if ("inventory" in cacheLike) {
    return {
      inventory: cacheLike.inventory,
      curSerial: cacheLike.curSerial,
      i: cacheLike.i,
      j: cacheLike.j,
      toMemento: cacheToMemento,
      fromMemento: cacheFromMemento,
    };
  } else {
    return {
      inventory: [],
      curSerial: 0,
      i: cacheLike.i,
      j: cacheLike.j,
      toMemento: cacheToMemento,
      fromMemento: cacheFromMemento,
    };
  }
}

function mintCoins(cache: Cache, amount: number): void {
  for (let k = 0; k < amount; k++) {
    cache.inventory.push({ i: cache.i, j: cache.j, serial: cache.curSerial++ });
  }
}
//endregion

let cacheCache: Map<string, string>;
function saveCC(lastUpdated: Cache) {
  cacheCache.set(
    [lastUpdated.i, lastUpdated.j].toString(),
    lastUpdated.toMemento(),
  );
  const storables: [string, string][] = [];
  Array.from(cacheCache.entries()).forEach((iter: [string, string]) => {
    storables.push(iter);
  });
  localStorage.setItem("cacheCache", JSON.stringify(storables));
}
function loadFromLocal() {
  const loadCache = localStorage.getItem("cacheCache");
  if (!loadCache) return;
  JSON.parse(loadCache).forEach((storable: [string, string]) => {
    cacheCache.set(storable[0], storable[1]);
  });
  playerInven = JSON.parse(localStorage.getItem("playerInven")!);
  if (!playerInven) playerInven = [];
  const tempLatlngs = JSON.parse(localStorage.getItem("playerTrail")!);
  if (tempLatlngs) {
    tempLatlngs.forEach((latlng: LatLng) => {
      playerTrail.addLatLng(latlng);
    });
  }
}
const currentCaches: Map<string, Marker> = new Map<string, Marker>();

document.querySelector<HTMLButtonElement>("#reset")!
  .addEventListener("click", () => {
    const prompt = globalThis.prompt('Type "RESET" to reset your data.');
    if (prompt === "RESET") {
      gameMap.closePopup();
      localStorage.clear();
      initialize();
    }
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

function geoLocationSuccess(geoLoc: GeolocationPosition) {
  realTimeLoc = true;
  panPlayerTo({ i: geoLoc.coords.latitude, j: geoLoc.coords.longitude });
  geoLocWatch = navigator.geolocation.watchPosition((loc) => {
    panPlayerTo({ i: loc.coords.latitude, j: loc.coords.longitude });
  });
}
function geoLocFailed() {
  globalThis.alert(
    "Geolocation Failed, make sure to enable, or use a more updated device!",
  );
}
document.querySelector<HTMLButtonElement>("#sensor")!.addEventListener(
  "click",
  () => {
    if (!realTimeLoc && navigator.geolocation) {
      document.querySelector<HTMLButtonElement>("#sensor")!.className =
        "active";
      navigator.geolocation.getCurrentPosition(
        geoLocationSuccess,
        geoLocFailed,
      );
    } else if (realTimeLoc) {
      document.querySelector<HTMLButtonElement>("#sensor")!.className = "";
      realTimeLoc = false;
      navigator.geolocation.clearWatch(geoLocWatch);
    }
  },
);

function initialize() {
  cacheCache = new Map<string, string>();
  currentCaches.clear();
  playerTrail.setLatLngs([]);
  realTimeLoc = false;
  playerMarker.bindTooltip("That's you!").addTo(gameMap);
  playerInven = [];
  loadFromLocal();
  playerTrail.addLatLng(playerLoc);
  inventoryDiv.dispatchEvent(inventoryChanged);
  updateCaches();
}

initialize();

function panPlayerTo(latLng: { i: number; j: number }) {
  playerLoc = leaflet.latLng(latLng.i, latLng.j);
  playerTrail.addLatLng(playerLoc);
  localStorage.setItem("playerTrail", JSON.stringify(playerTrail.getLatLngs()));
  gameMap.panTo(playerLoc);
  playerMarker.setLatLng(playerLoc);
  messengerMarker.fireEvent(playerMovedEvent, null, true);
}

function updateCaches() {
  // Look around the player's neighborhood for caches to spawn
  localTiles(playerLoc).forEach((tile) => {
    if (
      luck([tile.i, tile.j].toString()) < CACHE_SPAWN_PROBABILITY &&
      !currentCaches.has([tile.i, tile.j].toString())
    ) {
      spawnCache(tile);
    }
  });
}

function populateCache(tile: Tile): Cache {
  const key: string = [tile.i, tile.j].toString();
  if (!cacheCache.get(key)) { //Wholly new cache
    const cache = Cache(tile);
    const cacheCoins = Math.floor(
      luck([cache.i, cache.j, "randombullshitgo"].toString()) * 2 + 1,
    );
    mintCoins(cache, cacheCoins);
    saveCC(cache);
    return cache;
  }
  return cacheFromMemento(cacheCache.get(key)!);
}

function spawnCache(tile: Tile) {
  const cache = populateCache(tile);
  const location = leaflet.latLng(
    cache.i * TILE_DEGREES,
    cache.j * TILE_DEGREES,
  );

  const cacheMarker = leaflet.marker(location, { icon: cacheIcon }).addTo(
    gameMap,
  )
    .bindPopup(() => {
      const popupDiv = document.createElement("div");
      return updateCachePopup(popupDiv, cache);
    })
    .on(playerMovedEvent, () => { //might be a better way to do this
      if (isLocal(tile)) {
        return;
      }
      cacheMarker.removeFrom(gameMap);
      saveCC(cache);
      currentCaches.delete([tile.i, tile.j].toString());
      messengerMarker.removeEventParent(cacheMarker);
    });

  messengerMarker.addEventParent(cacheMarker);
  currentCaches.set([tile.i, tile.j].toString(), cacheMarker);
}

function updateCachePopup(popupDiv: HTMLDivElement, cache: Cache) {
  popupDiv.innerHTML = `<div>Cache: ${cache.i},${cache.j} <br>Inventory:</div>`;
  appendCollect(cache, popupDiv);

  if (playerInven.length > 0) {
    const depositButton = document.createElement("button");
    depositButton.innerHTML = "Deposit";
    depositButton.id = "give";
    depositButton.addEventListener("click", () => {
      if (playerInven.length <= 0) {
        return;
      }
      depositButton.remove();
      appendDeposit(cache, popupDiv);
    });
    popupDiv.appendChild(depositButton);
  }
  return popupDiv;
}

function appendCollect(
  cache: Cache,
  source: HTMLDivElement,
): HTMLDivElement {
  const invenLabel = document.createElement("div");
  cache.inventory.length > 0
    ? invenLabel.innerHTML = "Choose a coin: "
    : invenLabel.innerHTML = "Cache is empty.";

  cache.inventory.forEach((coin) => {
    const buttonDiv = document.createElement("div");
    buttonDiv.innerHTML = `Coin: ${getCoinLabel(coin)}  `;
    invenLabel.append(buttonDiv);

    const onSelect = function () {
      transferCoin(cache.inventory, playerInven, coin);
      saveCC(cache);
      updateCachePopup(source, cache);
    };
    buttonDiv.append(coinSelectButton(onSelect));
  });
  source.append(invenLabel);
  return invenLabel;
}

function appendDeposit(cache: Cache, source: HTMLDivElement): HTMLDivElement {
  const depositDiv = document.createElement("div");
  depositDiv.innerHTML = "Deposit: ";

  playerInven.forEach((coin) => {
    const buttonDiv = document.createElement("div");
    buttonDiv.innerHTML = `Coin: ${getCoinLabel(coin)}  `;
    depositDiv.append(buttonDiv);

    const onSelect = function () {
      transferCoin(playerInven, cache.inventory, coin);
      saveCC(cache);
      updateCachePopup(source, cache);
    };
    buttonDiv.append(coinSelectButton(onSelect));
  });

  source.append(depositDiv);
  return depositDiv;
}

function coinSelectButton(onSelect: () => void) {
  const coinButton = document.createElement("button");
  coinButton.innerHTML = "Select";
  coinButton.addEventListener("click", onSelect);
  return coinButton;
}
