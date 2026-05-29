import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const file = resolve("db/attacks.json");
const database = JSON.parse(await readFile(file, "utf8"));
const removeIds = new Set(["aes-biclique-full", "sm4-sms4-differential"]);
const removeAlgorithmKeys = new Set(["aes-128-192-256"]);

const nonAes = (record) =>
  !["aes-128", "aes-192", "aes-256", "aes-128-192-256"].includes(record.algorithmKey);

const patches = new Map(
  Object.entries({
    "des-linear": {
      data: "2^43",
      time: "2^43",
      memory: ""
    },
    "des-differential": {
      data: "2^47",
      time: "2^47",
      memory: "2^37 bytes"
    },
    "present-single-key": {
      data: "2^64",
      time: "2^72",
      memory: "2^40"
    },
    "present-statistical": {
      data: "2^63",
      time: "",
      memory: ""
    },
    "serpent-rectangle": {
      data: "2^125.3",
      time: "2^139.2",
      memory: ""
    },
    "twofish-reduced": {
      data: "2^127",
      time: "",
      memory: ""
    },
    "rc6-reduced": {
      data: "2^119",
      time: "2^127",
      memory: ""
    },
    "misty1-full-integral": {
      attack: "Integral / division-property key recovery",
      model: "single-key chosen-plaintext key recovery",
      data: "2^64",
      time: "2^69.5",
      memory: "",
      venue: "CRYPTO",
      year: 2016,
      paper: "A 2^70 Attack on the Full MISTY1",
      url: "https://doi.org/10.1007/978-3-662-53018-4_16",
      sourceKey: "crypto-2016-a-2-70-attack-on-the-full-misty1"
    },
    "kasumi-sandwich": {
      attack: "Sandwich / boomerang attack",
      model: "related-key chosen-plaintext key recovery",
      data: "2^26",
      time: "2^32",
      memory: "2^30 bytes",
      venue: "CRYPTO",
      year: 2010,
      paper: "A Practical-Time Related-Key Attack on the KASUMI Cryptosystem Used in GSM and 3G Telephony",
      url: "https://doi.org/10.1007/978-3-642-14623-7_21",
      sourceKey: "crypto-2010-a-practical-time-related-key-attack-on-the-kasumi-cryptosystem-used-in-gsm-and-3g-telephony"
    },
    "camellia-impossible": {
      attack: "Impossible differential",
      model: "single-key chosen-plaintext key recovery",
      attackedRounds: "11",
      data: "2^122",
      time: "2^122",
      memory: "2^102 bytes"
    },
    "clefia-impossible": {
      data: "2^117.8",
      time: "2^121.2",
      memory: "2^86.8 blocks"
    },
    "sm4-sms4-integral": {
      id: "sm4-sms4-linear",
      attack: "Multidimensional linear cryptanalysis",
      model: "single-key known-plaintext key recovery",
      attackedRounds: "22",
      data: "",
      time: "",
      memory: ""
    },
    "sm4-sms4-linear": {
      attack: "Multidimensional linear cryptanalysis",
      model: "single-key known-plaintext key recovery",
      attackedRounds: "22",
      data: "",
      time: "",
      memory: ""
    },
    "aria-square": {
      data: "",
      time: "",
      memory: ""
    },
    "prince-biclique": {
      data: "2^57",
      time: "2^126.12",
      memory: "2^9 blocks"
    },
    "skinny-mitm": {
      data: "2^64",
      time: "2^126",
      memory: "2^96 bytes"
    },
    "gift-differential": {
      data: "2^63",
      time: "2^112",
      memory: ""
    },
    "simon-linear": {
      data: "2^31",
      time: "2^62",
      memory: ""
    },
    "speck-differential": {
      data: "2^31",
      time: "2^62",
      memory: ""
    },
    "led-impossible": {
      data: "2^64",
      time: "2^64",
      memory: ""
    },
    "kuznyechik-mitm": {
      data: "2^64",
      time: "2^140",
      memory: "2^128 bytes"
    },
    "md5-collision": {
      data: "",
      time: "2^39",
      memory: ""
    },
    "md5-chosen-prefix": {
      data: "",
      time: "2^50",
      memory: ""
    },
    "md4-collision": {
      venue: "EUROCRYPT",
      year: 2005,
      paper: "Collisions for Hash Functions MD4, MD5, HAVAL-128 and RIPEMD",
      url: "https://doi.org/10.1007/11426639_36",
      sourceKey: "eurocrypt-2005-collisions-for-hash-functions-md4-md5-haval-128-and-ripemd",
      data: "",
      time: "2^8",
      memory: ""
    },
    "sha1-full-collision": {
      data: "",
      time: "2^63.1",
      memory: ""
    },
    "sha1-shappening": {
      data: "",
      time: "2^57.5",
      memory: ""
    },
    "sha1-wang": {
      data: "",
      time: "2^69",
      memory: ""
    },
    "sha256-preimage": {
      data: "",
      time: "2^254.9",
      memory: "2^6 words"
    },
    "sha256-collision": {
      data: "",
      time: "2^65.5",
      memory: ""
    },
    "sha512-preimage": {
      data: "",
      time: "2^511.5",
      memory: "2^6 words"
    },
    "ripemd-collision": {
      data: "",
      time: "2^18",
      memory: ""
    },
    "whirlpool-rebound": {
      data: "",
      time: "2^120",
      memory: "2^64 bytes"
    },
    "groestl-rebound": {
      data: "",
      time: "2^120",
      memory: "2^64 bytes"
    },
    "skein-biclique": {
      data: "",
      time: "2^511.5",
      memory: ""
    },
    "blake-rebound": {
      data: "",
      time: "2^224",
      memory: ""
    },
    "jh-rebound": {
      data: "",
      time: "",
      memory: ""
    },
    "keccak-crunchy-collision": {
      attackedRounds: "6",
      data: "",
      time: "",
      memory: ""
    },
    "keccak-cube": {
      attackedRounds: "7",
      data: "2^n",
      time: "2^n",
      memory: ""
    },
    "sha3-rotational": {
      data: "",
      time: "",
      memory: ""
    },
    "ascon-attack": {
      data: "2^64",
      time: "2^64 / 2^96",
      memory: ""
    },
    "gimli-differential": {
      data: "",
      time: "",
      memory: ""
    },
    "xoodoo-xoodyak": {
      data: "",
      time: "",
      memory: ""
    },
    "photon-collision": {
      data: "",
      time: "2^32 / 2^64",
      memory: ""
    },
    "spongent-collision": {
      data: "",
      time: "",
      memory: ""
    },
    "chaskey": {
      data: "2^48",
      time: "2^67",
      memory: ""
    }
  })
);

const addedRecords = [];

function numbers(value) {
  return String(value).match(/\d+(\.\d+)?/g)?.map(Number) || [];
}

function coverage(record) {
  const total = numbers(record.totalRounds);
  const attacked = numbers(record.attackedRounds);
  if (!total.length || !attacked.length) return null;
  return Number(Math.min(1, Math.max(...attacked) / Math.max(...total)).toFixed(4));
}

function refreshPublication(record) {
  record.publication = {
    venue: record.venue,
    year: record.year,
    title: record.paper,
    url: record.url
  };
}

for (const record of database.records) {
  if (!nonAes(record)) continue;
  const patch = patches.get(record.id);
  if (patch) Object.assign(record, patch);
  delete record.authors;
  if (record.publication) delete record.publication.authors;
  record.roundCoverage = coverage(record);
  refreshPublication(record);
}

for (const addition of addedRecords) {
  if (database.records.some((record) => record.id === addition.id)) continue;
  const template = database.records.find((record) => record.id === addition.templateId);
  if (!template) throw new Error(`Missing template record: ${addition.templateId}`);
  const { templateId, ...recordPatch } = addition;
  const record = { ...template, ...recordPatch };
  record.roundCoverage = coverage(record);
  refreshPublication(record);
  database.records.push(record);
}

database.records = database.records.filter(
  (record) => !removeIds.has(record.id) && !removeAlgorithmKeys.has(record.algorithmKey)
);

database.generatedAt = new Date().toISOString();
database.meta.updated = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai"
}).format(new Date());

await writeFile(file, `${JSON.stringify(database, null, 2)}\n`);
