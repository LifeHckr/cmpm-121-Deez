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
let playerLoc = initLoc;
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 3;
const CACHE_SPAWN_PROBABILITY = .1;
const playerMovedEvent: string = "player-moved";

const playerIcon = leaflet.icon({
  iconUrl: playerIconURL,
  tooltipAnchor: [-16, 16],
});
const cacheIcon = leaflet.icon({
  iconUrl: cacheIconURL,
  tooltipAnchor: [-16, 16],
  popupAnchor: [16, 16],
});

class MapManager {
  private map;
  private playerMarker: Marker;

  //region Persistence
  public currentCaches: Map<string, Marker> = new Map<string, Marker>();

  private cacheCache: Map<string, string> = new Map<string, string>();

  CCGet(key: string): string | null {
    if (this.cacheCache.has(key)) {
      return this.cacheCache.get(key)!;
    }
    return null;
  }

  saveCache(lastUpdated: Cache) {
    this.cacheCache.set(
      [lastUpdated.i, lastUpdated.j].toString(),
      CachePersistence.cacheToMemento(lastUpdated),
    );
    const storables: [string, string][] = [];
    Array.from(this.cacheCache.entries()).forEach((iter: [string, string]) => {
      storables.push(iter);
    });
    localStorage.setItem("cacheCache", JSON.stringify(storables));
  }

  loadFromLocal() {
    const loadCache = localStorage.getItem("cacheCache");
    if (!loadCache) return;
    JSON.parse(loadCache).forEach((storable: [string, string]) => {
      this.cacheCache.set(storable[0], storable[1]);
    });
    const tempInventory: coinLike[] = JSON.parse(
      localStorage.getItem("playerInven")!,
    );
    if (tempInventory) {
      for (const coin of tempInventory) {
        playerInven.push(new Coin(coin.i, coin.j, coin.serial));
      }
    }
    if (!playerInven) playerInven = [];
    const tempLatlngs = JSON.parse(localStorage.getItem("playerTrail")!);
    if (tempLatlngs) {
      tempLatlngs.forEach((latlng: LatLng) => {
        playerTrail.addLatLng(latlng);
      });
    }
  }

  clearCaches(): void {
    this.currentCaches.clear();
    this.cacheCache.clear();
  }
  //endregion

  spawnCache(tile: Tile) {
    const cache = populateCache(tile);
    const location = leaflet.latLng(
      cache.i * TILE_DEGREES,
      cache.j * TILE_DEGREES,
    );

    const cacheMarker = leaflet.marker(location, { icon: cacheIcon }).addTo(
      this.map,
    )
      .bindPopup(() => {
        const popupDiv = document.createElement("div");
        return updateCachePopup(popupDiv, cache);
      })
      .on(playerMovedEvent, () => {
        if (isLocal(tile)) {
          return;
        }
        cacheMarker.removeFrom(this.map);
        this.saveCache(cache);
        this.currentCaches.delete([tile.i, tile.j].toString());
        this.playerMarker.removeEventParent(cacheMarker);
      });

    this.playerMarker.addEventParent(cacheMarker);
    this.currentCaches.set([tile.i, tile.j].toString(), cacheMarker);
  }

  hasCache(tile: Tile): boolean {
    return this.currentCaches.has([tile.i, tile.j].toString());
  }

  constructor(mapElementId: string, initLoc: LatLng) {
    this.map = leaflet.map(document.getElementById(mapElementId)!, {
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
    }).addTo(this.map);

    this.playerMarker = leaflet.marker(initLoc, { icon: playerIcon }).addTo(
      this.map,
    );

    this.playerMarker.bindTooltip("That's you!").addTo(this.map);
    this.playerMarker.addEventListener(playerMovedEvent, () => {
      updateCaches();
    });

    this.setPlayerLocation(initLoc);
  }

  panTo(latlng: LatLng) {
    this.map.panTo(latlng);
  }

  setPlayerLocation(loc: LatLng): void {
    this.playerMarker.setLatLng(loc);
    this.map.panTo(loc);
  }

  panPlayerTo(latLng: { i: number; j: number }) {
    playerLoc = leaflet.latLng(latLng.i, latLng.j);
    playerTrail.addLatLng(playerLoc);
    localStorage.setItem(
      "playerTrail",
      JSON.stringify(playerTrail.getLatLngs()),
    );
    CurMap.panTo(playerLoc);
    this.playerMarker.setLatLng(playerLoc);
    this.playerMarker.fireEvent(playerMovedEvent, null, true);
  }

  // Fuck you O_O
  addMToMap(obj: Marker) {
    return obj.addTo(this.map);
  }
  addPToMap(obj: Polyline) {
    return obj.addTo(this.map);
  }

  removeFromMap(obj: Marker | Polyline): void {
    obj.removeFrom(this.map);
  }

  closePopup(): void {
    this.map.closePopup();
  }
}

class UIManager {
  static inventoryDiv: HTMLDivElement = document.querySelector<HTMLDivElement>(
    "#statusPanel",
  )!;

  static updateInventory(inventory: Coin[]): void {
    if (playerInven.length < 1) {
      this.inventoryDiv.innerHTML = emptyInvenFlavor;
      return;
    }
    this.inventoryDiv.innerHTML = "Inventory: ";
    for (const coin of inventory) {
      const buttonAnchor = document.createElement("a");
      buttonAnchor.innerHTML = `Coin: ${coin.getCoinLabel()} <br>`;
      buttonAnchor.onclick = () => {
        CurMap.panTo(
          leaflet.latLng(
            coin.getTile().i * TILE_DEGREES,
            coin.getTile().j * TILE_DEGREES,
          ),
        );
      };
      this.inventoryDiv.append(buttonAnchor);
    }
    saveInven();
  }
}

const CurMap = new MapManager("map", initLoc);

//endregion
let realTimeLoc: boolean = false;
let geoLocWatch: number;
const emptyInvenFlavor: string =
  "Inventory empty. Go out there and get some coins!";

//Vector2 type
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
interface coinLike {
  i: number;
  j: number;
  serial: number;
}
class Coin {
  private i: number;
  private j: number;
  private serial: number;

  constructor(i: number, j: number, serial: number) {
    this.i = i;
    this.j = j;
    this.serial = serial;
  }

  getTile(): Tile {
    return { i: this.i, j: this.j };
  }

  getCoinLabel() {
    return `${this.i}:${this.j}#${this.serial}`;
  }
}

function transferCoin(from: Coin[], to: Coin[], coin: Coin) {
  const index = from.indexOf(coin);
  if (index <= -1) return; //error
  from.splice(index, 1);
  to.push(coin);
  UIManager.updateInventory(playerInven);
}
//endregion

let playerInven: Coin[];
function saveInven() {
  localStorage.setItem("playerInven", JSON.stringify(playerInven));
}

const playerTrail: Polyline = CurMap.addPToMap(leaflet.polyline([]));

//region Cache
class Cache {
  i: number;
  j: number;
  inventory: Coin[];
  curSerial: number;

  constructor(
    tile: Tile = { i: 0, j: 0 },
    curSerial: number = 0,
    inventory: Coin[] = [],
  ) {
    this.i = tile.i;
    this.j = tile.j;
    this.inventory = inventory;
    this.curSerial = curSerial;
  }

  mintCoins(amount: number): void {
    for (let k = 0; k < amount; k++) {
      this.inventory.push(new Coin(this.i, this.j, this.curSerial++));
    }
  }

  getInventor(): Coin[] {
    return this.inventory;
  }
}

class CachePersistence {
  static cacheToMemento(cache: Cache): string {
    return JSON.stringify(cache);
  }

  static cacheFromMemento(str: string): Cache {
    const tempCache = JSON.parse(str);
    const resCache = new Cache();
    resCache.i = tempCache.i;
    resCache.j = tempCache.j;
    for (const coinLike of tempCache.inventory) {
      resCache.inventory.push(
        new Coin(coinLike.i, coinLike.j, coinLike.serial),
      );
    }
    return resCache;
  }
}
//endregion

document.querySelector<HTMLButtonElement>("#reset")!
  .addEventListener("click", () => {
    const prompt = globalThis.prompt('Type "RESET" to reset your data.');
    if (prompt === "RESET") {
      CurMap.closePopup();
      localStorage.clear();
      initialize();
    }
  });
document.querySelector<HTMLButtonElement>("#north")!
  .addEventListener("click", () => {
    CurMap.panPlayerTo({ i: playerLoc.lat + TILE_DEGREES, j: playerLoc.lng });
  });
document.querySelector<HTMLButtonElement>("#south")!
  .addEventListener("click", () => {
    CurMap.panPlayerTo({ i: playerLoc.lat - TILE_DEGREES, j: playerLoc.lng });
  });
document.querySelector<HTMLButtonElement>("#west")!
  .addEventListener("click", () => {
    CurMap.panPlayerTo({ i: playerLoc.lat, j: playerLoc.lng - TILE_DEGREES });
  });
document.querySelector<HTMLButtonElement>("#east")!
  .addEventListener("click", () => {
    CurMap.panPlayerTo({ i: playerLoc.lat, j: playerLoc.lng + TILE_DEGREES });
  });

function geoLocationSuccess(geoLoc: GeolocationPosition) {
  realTimeLoc = true;
  CurMap.panPlayerTo({ i: geoLoc.coords.latitude, j: geoLoc.coords.longitude });
  geoLocWatch = navigator.geolocation.watchPosition((loc) => {
    CurMap.panPlayerTo({ i: loc.coords.latitude, j: loc.coords.longitude });
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
  CurMap.clearCaches();
  playerTrail.setLatLngs([]);
  realTimeLoc = false;
  playerInven = [];
  CurMap.loadFromLocal();
  playerTrail.addLatLng(playerLoc);
  UIManager.updateInventory(playerInven);
  updateCaches();
}

initialize();

function updateCaches() {
  // Look around the player's neighborhood for caches to spawn
  localTiles(playerLoc).forEach((tile) => {
    if (
      luck([tile.i, tile.j].toString()) < CACHE_SPAWN_PROBABILITY &&
      !CurMap.hasCache(tile)
    ) {
      CurMap.spawnCache(tile);
    }
  });
}

function populateCache(tile: Tile): Cache {
  const key: string = [tile.i, tile.j].toString();
  if (!CurMap.CCGet(key)) { //Wholly new cache
    const cache = new Cache(tile);
    const cacheCoins = Math.floor(
      luck([cache.i, cache.j, "randombullshitgo"].toString()) * 2 + 1,
    );
    cache.mintCoins(cacheCoins);
    CurMap.saveCache(cache);
    return cache;
  }
  return CachePersistence.cacheFromMemento(CurMap.CCGet(key)!);
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
    buttonDiv.innerHTML = `Coin: ${coin.getCoinLabel()}  `;
    invenLabel.append(buttonDiv);

    const onSelect = function () {
      transferCoin(cache.inventory, playerInven, coin);
      CurMap.saveCache(cache);
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
    buttonDiv.innerHTML = `Coin: ${coin.getCoinLabel()}  `;
    depositDiv.append(buttonDiv);

    const onSelect = function () {
      transferCoin(playerInven, cache.inventory, coin);
      CurMap.saveCache(cache);
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
