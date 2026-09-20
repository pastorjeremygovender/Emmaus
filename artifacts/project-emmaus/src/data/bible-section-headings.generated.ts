/**
 * Bible section headings anchored to their first verse.
 * Generated from the official Berean Standard Bible USFM section markers.
 * The Berean Bible text and editorial material entered the public domain
 * on 30 April 2023: https://berean.bible/licensing.htm
 *
 * Regenerate with:
 * node scripts/src/generate-bible-section-headings.mjs <bsb-usfm-dir> \
 *   artifacts/api-server/data/bible/bsb \
 *   artifacts/project-emmaus/src/data/bible-section-headings.generated.ts
 */

export type BibleSectionHeading = { verse: number; title: string };

export const BIBLE_SECTION_HEADINGS: Readonly<Record<string, readonly BibleSectionHeading[]>> = {
  "genesis:1": [
    {
      "verse": 1,
      "title": "The Creation"
    },
    {
      "verse": 3,
      "title": "The First Day"
    },
    {
      "verse": 6,
      "title": "The Second Day"
    },
    {
      "verse": 9,
      "title": "The Third Day"
    },
    {
      "verse": 14,
      "title": "The Fourth Day"
    },
    {
      "verse": 20,
      "title": "The Fifth Day"
    },
    {
      "verse": 24,
      "title": "The Sixth Day"
    }
  ],
  "genesis:2": [
    {
      "verse": 1,
      "title": "The Seventh Day"
    },
    {
      "verse": 4,
      "title": "Man and Woman in the Garden"
    }
  ],
  "genesis:3": [
    {
      "verse": 1,
      "title": "The Serpent’s Deception"
    },
    {
      "verse": 8,
      "title": "God Arraigns Adam and Eve"
    },
    {
      "verse": 14,
      "title": "The Fate of the Serpent"
    },
    {
      "verse": 16,
      "title": "The Punishment of Mankind"
    },
    {
      "verse": 21,
      "title": "The Expulsion from Paradise"
    }
  ],
  "genesis:4": [
    {
      "verse": 1,
      "title": "Cain and Abel"
    },
    {
      "verse": 17,
      "title": "The Descendants of Cain"
    },
    {
      "verse": 25,
      "title": "Seth and Enosh"
    }
  ],
  "genesis:5": [
    {
      "verse": 1,
      "title": "The Descendants of Adam"
    },
    {
      "verse": 18,
      "title": "God Takes Up Enoch"
    },
    {
      "verse": 25,
      "title": "From Methuselah to Noah"
    }
  ],
  "genesis:6": [
    {
      "verse": 1,
      "title": "Corruption on the Earth"
    },
    {
      "verse": 8,
      "title": "Noah’s Favor with God"
    },
    {
      "verse": 13,
      "title": "Preparing the Ark"
    }
  ],
  "genesis:7": [
    {
      "verse": 1,
      "title": "The Great Flood"
    }
  ],
  "genesis:8": [
    {
      "verse": 1,
      "title": "The Ark Rests on Ararat"
    },
    {
      "verse": 6,
      "title": "Noah Sends a Raven and a Dove"
    },
    {
      "verse": 13,
      "title": "Exiting the Ark"
    },
    {
      "verse": 20,
      "title": "Noah Builds an Altar"
    }
  ],
  "genesis:9": [
    {
      "verse": 1,
      "title": "The Covenant of the Rainbow"
    },
    {
      "verse": 18,
      "title": "Noah’s Shame and Canaan’s Curse"
    },
    {
      "verse": 26,
      "title": "Shem’s Blessing and Noah’s Death"
    }
  ],
  "genesis:10": [
    {
      "verse": 1,
      "title": "The Table of Nations"
    },
    {
      "verse": 2,
      "title": "The Japhethites"
    },
    {
      "verse": 6,
      "title": "The Hamites"
    },
    {
      "verse": 21,
      "title": "The Semites"
    }
  ],
  "genesis:11": [
    {
      "verse": 1,
      "title": "The Tower of Babel"
    },
    {
      "verse": 10,
      "title": "Genealogy from Shem to Abram"
    },
    {
      "verse": 27,
      "title": "Terah’s Descendants"
    }
  ],
  "genesis:12": [
    {
      "verse": 1,
      "title": "The Call of Abram"
    },
    {
      "verse": 10,
      "title": "Abram and Sarai in Egypt"
    }
  ],
  "genesis:13": [
    {
      "verse": 1,
      "title": "Abram and Lot Part Ways"
    },
    {
      "verse": 10,
      "title": "Lot Proceeds toward Sodom"
    },
    {
      "verse": 14,
      "title": "God Renews the Promise to Abram"
    }
  ],
  "genesis:14": [
    {
      "verse": 1,
      "title": "The War of the Kings"
    },
    {
      "verse": 10,
      "title": "Abram Rescues Lot"
    },
    {
      "verse": 17,
      "title": "Melchizedek Blesses Abram"
    }
  ],
  "genesis:15": [
    {
      "verse": 1,
      "title": "God’s Covenant with Abram"
    },
    {
      "verse": 8,
      "title": "God Confirms His Promise"
    }
  ],
  "genesis:16": [
    {
      "verse": 1,
      "title": "Hagar and Ishmael"
    }
  ],
  "genesis:17": [
    {
      "verse": 1,
      "title": "Abraham to Father Many Nations"
    },
    {
      "verse": 9,
      "title": "The Covenant of Circumcision"
    }
  ],
  "genesis:18": [
    {
      "verse": 1,
      "title": "The Three Visitors"
    },
    {
      "verse": 9,
      "title": "Sarah Laughs at the Promise"
    },
    {
      "verse": 16,
      "title": "Abraham Intercedes for Sodom"
    }
  ],
  "genesis:19": [
    {
      "verse": 1,
      "title": "Lot Welcomes the Angels"
    },
    {
      "verse": 12,
      "title": "Lot Flees to Zoar"
    },
    {
      "verse": 24,
      "title": "The Destruction of Sodom and Gomorrah"
    },
    {
      "verse": 30,
      "title": "Lot and His Daughters"
    }
  ],
  "genesis:20": [
    {
      "verse": 1,
      "title": "Abraham, Sarah, and Abimelech"
    }
  ],
  "genesis:21": [
    {
      "verse": 1,
      "title": "The Birth of Isaac"
    },
    {
      "verse": 9,
      "title": "Sarah Turns against Hagar"
    },
    {
      "verse": 22,
      "title": "The Covenant at Beersheba"
    }
  ],
  "genesis:22": [
    {
      "verse": 1,
      "title": "The Offering of Isaac"
    },
    {
      "verse": 11,
      "title": "The LORD Provides the Sacrifice"
    },
    {
      "verse": 20,
      "title": "The Sons of Nahor"
    }
  ],
  "genesis:23": [
    {
      "verse": 1,
      "title": "The Death and Burial of Sarah"
    }
  ],
  "genesis:24": [
    {
      "verse": 1,
      "title": "A Wife for Isaac"
    },
    {
      "verse": 15,
      "title": "Rebekah Is Chosen"
    },
    {
      "verse": 62,
      "title": "Isaac Marries Rebekah"
    }
  ],
  "genesis:25": [
    {
      "verse": 1,
      "title": "Abraham and Keturah"
    },
    {
      "verse": 7,
      "title": "The Death of Abraham"
    },
    {
      "verse": 12,
      "title": "The Descendants of Ishmael"
    },
    {
      "verse": 19,
      "title": "Jacob and Esau"
    },
    {
      "verse": 29,
      "title": "Esau Sells His Birthright"
    }
  ],
  "genesis:26": [
    {
      "verse": 1,
      "title": "God’s Promise to Isaac"
    },
    {
      "verse": 6,
      "title": "Isaac Deceives Abimelech"
    },
    {
      "verse": 12,
      "title": "Isaac’s Prosperity"
    },
    {
      "verse": 26,
      "title": "Isaac’s Covenant with Abimelech"
    },
    {
      "verse": 34,
      "title": "Esau’s Wives"
    }
  ],
  "genesis:27": [
    {
      "verse": 1,
      "title": "Isaac Blesses Jacob"
    },
    {
      "verse": 30,
      "title": "Esau’s Lost Hope"
    }
  ],
  "genesis:28": [
    {
      "verse": 1,
      "title": "Jacob’s Departure"
    },
    {
      "verse": 6,
      "title": "Esau Marries Mahalath"
    },
    {
      "verse": 10,
      "title": "Jacob’s Ladder"
    },
    {
      "verse": 18,
      "title": "The Stone of Bethel"
    }
  ],
  "genesis:29": [
    {
      "verse": 1,
      "title": "Jacob Meets Rachel"
    },
    {
      "verse": 14,
      "title": "Jacob Marries Leah and Rachel"
    },
    {
      "verse": 31,
      "title": "Reuben, Simeon, Levi, and Judah"
    }
  ],
  "genesis:30": [
    {
      "verse": 1,
      "title": "Dan and Naphtali"
    },
    {
      "verse": 9,
      "title": "Gad and Asher"
    },
    {
      "verse": 17,
      "title": "Issachar, Zebulun, and Dinah"
    },
    {
      "verse": 22,
      "title": "Joseph"
    },
    {
      "verse": 25,
      "title": "Jacob Prospers"
    }
  ],
  "genesis:31": [
    {
      "verse": 1,
      "title": "Jacob Flees from Laban"
    },
    {
      "verse": 22,
      "title": "Laban Pursues Jacob"
    },
    {
      "verse": 43,
      "title": "Jacob’s Covenant with Laban"
    }
  ],
  "genesis:32": [
    {
      "verse": 1,
      "title": "Jacob Prepares to Meet Esau"
    },
    {
      "verse": 22,
      "title": "Jacob Wrestles with God"
    }
  ],
  "genesis:33": [
    {
      "verse": 1,
      "title": "Jacob Meets Esau"
    },
    {
      "verse": 18,
      "title": "Jacob Settles in Shechem"
    }
  ],
  "genesis:34": [
    {
      "verse": 1,
      "title": "The Defiling of Dinah"
    },
    {
      "verse": 13,
      "title": "The Revenge of Dinah’s Brothers"
    }
  ],
  "genesis:35": [
    {
      "verse": 1,
      "title": "Jacob Returns to Bethel"
    },
    {
      "verse": 16,
      "title": "Benjamin Born, Rachel Dies"
    },
    {
      "verse": 21,
      "title": "The Sons of Jacob"
    },
    {
      "verse": 27,
      "title": "The Death of Isaac"
    }
  ],
  "genesis:36": [
    {
      "verse": 1,
      "title": "The Descendants of Esau"
    },
    {
      "verse": 20,
      "title": "The Descendants of Seir"
    },
    {
      "verse": 31,
      "title": "The Kings of Edom"
    }
  ],
  "genesis:37": [
    {
      "verse": 1,
      "title": "Joseph’s Dreams"
    },
    {
      "verse": 12,
      "title": "Joseph Sold into Egypt"
    },
    {
      "verse": 31,
      "title": "Jacob Mourns Joseph"
    }
  ],
  "genesis:38": [
    {
      "verse": 1,
      "title": "Judah and Tamar"
    },
    {
      "verse": 27,
      "title": "The Birth of Perez and Zerah"
    }
  ],
  "genesis:39": [
    {
      "verse": 1,
      "title": "Joseph and Potiphar’s Wife"
    },
    {
      "verse": 13,
      "title": "Joseph Falsely Imprisoned"
    }
  ],
  "genesis:40": [
    {
      "verse": 1,
      "title": "The Cupbearer and the Baker"
    }
  ],
  "genesis:41": [
    {
      "verse": 1,
      "title": "The Dreams of Pharaoh"
    },
    {
      "verse": 14,
      "title": "Joseph Interprets Pharaoh’s Dreams"
    },
    {
      "verse": 37,
      "title": "Joseph Given Charge of Egypt"
    },
    {
      "verse": 46,
      "title": "The Seven Years of Plenty"
    },
    {
      "verse": 53,
      "title": "The Famine Begins"
    }
  ],
  "genesis:42": [
    {
      "verse": 1,
      "title": "Joseph’s Brothers Sent to Egypt"
    },
    {
      "verse": 25,
      "title": "Joseph’s Brothers Return to Canaan"
    }
  ],
  "genesis:43": [
    {
      "verse": 1,
      "title": "The Return to Egypt with Benjamin"
    },
    {
      "verse": 16,
      "title": "Joseph’s Hospitality to His Brothers"
    }
  ],
  "genesis:44": [
    {
      "verse": 1,
      "title": "Benjamin and the Silver Cup"
    },
    {
      "verse": 18,
      "title": "Judah Pleads for Benjamin"
    }
  ],
  "genesis:45": [
    {
      "verse": 1,
      "title": "Joseph Reveals His Identity"
    },
    {
      "verse": 9,
      "title": "Joseph Sends for His Father"
    },
    {
      "verse": 16,
      "title": "Pharaoh Invites Jacob to Egypt"
    },
    {
      "verse": 25,
      "title": "The Revival of Jacob"
    }
  ],
  "genesis:46": [
    {
      "verse": 1,
      "title": "Jacob’s Journey to Egypt"
    },
    {
      "verse": 7,
      "title": "Those Who Went to Egypt"
    },
    {
      "verse": 8,
      "title": "The Children of Leah"
    },
    {
      "verse": 16,
      "title": "The Children of Zilpah"
    },
    {
      "verse": 19,
      "title": "The Children of Rachel"
    },
    {
      "verse": 23,
      "title": "The Children of Bilhah"
    },
    {
      "verse": 28,
      "title": "Jacob Arrives in Egypt"
    }
  ],
  "genesis:47": [
    {
      "verse": 1,
      "title": "Jacob Settles in Goshen"
    },
    {
      "verse": 13,
      "title": "The Famine Continues"
    },
    {
      "verse": 27,
      "title": "The Israelites Prosper in Goshen"
    }
  ],
  "genesis:48": [
    {
      "verse": 1,
      "title": "Jacob Blesses Ephraim and Manasseh"
    }
  ],
  "genesis:49": [
    {
      "verse": 1,
      "title": "Jacob Blesses His Sons"
    },
    {
      "verse": 29,
      "title": "The Death of Jacob"
    }
  ],
  "genesis:50": [
    {
      "verse": 1,
      "title": "Mourning and Burial for Jacob"
    },
    {
      "verse": 15,
      "title": "Joseph Comforts His Brothers"
    },
    {
      "verse": 22,
      "title": "The Death of Joseph"
    }
  ],
  "exodus:1": [
    {
      "verse": 1,
      "title": "The Israelites Multiply in Egypt"
    },
    {
      "verse": 8,
      "title": "Oppression by a New King"
    }
  ],
  "exodus:2": [
    {
      "verse": 1,
      "title": "The Birth and Adoption of Moses"
    },
    {
      "verse": 11,
      "title": "The Rejection and Flight of Moses"
    },
    {
      "verse": 23,
      "title": "God Hears the Cry of the Israelites"
    }
  ],
  "exodus:3": [
    {
      "verse": 1,
      "title": "Moses at the Burning Bush"
    }
  ],
  "exodus:4": [
    {
      "verse": 1,
      "title": "Moses’ Staff"
    },
    {
      "verse": 6,
      "title": "Moses’ Hand"
    },
    {
      "verse": 10,
      "title": "The Appointment of Aaron"
    },
    {
      "verse": 18,
      "title": "Moses Leaves for Egypt"
    },
    {
      "verse": 27,
      "title": "The People Believe Moses and Aaron"
    }
  ],
  "exodus:5": [
    {
      "verse": 1,
      "title": "Pharaoh’s First Refusal"
    },
    {
      "verse": 6,
      "title": "Bricks and Straw"
    },
    {
      "verse": 15,
      "title": "The Cry of the Israelites"
    }
  ],
  "exodus:6": [
    {
      "verse": 1,
      "title": "God Promises Deliverance"
    },
    {
      "verse": 14,
      "title": "Genealogies of Moses and Aaron"
    }
  ],
  "exodus:7": [
    {
      "verse": 1,
      "title": "God Commands Moses and Aaron"
    },
    {
      "verse": 8,
      "title": "Aaron’s Staff"
    },
    {
      "verse": 14,
      "title": "The First Plague: Blood"
    }
  ],
  "exodus:8": [
    {
      "verse": 1,
      "title": "The Second Plague: Frogs"
    },
    {
      "verse": 16,
      "title": "The Third Plague: Gnats"
    },
    {
      "verse": 20,
      "title": "The Fourth Plague: Flies"
    }
  ],
  "exodus:9": [
    {
      "verse": 1,
      "title": "The Fifth Plague: Livestock"
    },
    {
      "verse": 8,
      "title": "The Sixth Plague: Boils"
    },
    {
      "verse": 13,
      "title": "The Seventh Plague: Hail"
    }
  ],
  "exodus:10": [
    {
      "verse": 1,
      "title": "The Eighth Plague: Locusts"
    },
    {
      "verse": 21,
      "title": "The Ninth Plague: Darkness"
    }
  ],
  "exodus:11": [
    {
      "verse": 1,
      "title": "The Plague on the Firstborn Foretold"
    }
  ],
  "exodus:12": [
    {
      "verse": 1,
      "title": "The First Passover"
    },
    {
      "verse": 14,
      "title": "The Feast of Unleavened Bread"
    },
    {
      "verse": 29,
      "title": "The Tenth Plague: Death of the Firstborn"
    },
    {
      "verse": 31,
      "title": "The Exodus Begins"
    },
    {
      "verse": 43,
      "title": "Instructions for the Passover"
    }
  ],
  "exodus:13": [
    {
      "verse": 1,
      "title": "The Dedication of the Firstborn"
    },
    {
      "verse": 17,
      "title": "The Pillars of Cloud and Fire"
    }
  ],
  "exodus:14": [
    {
      "verse": 1,
      "title": "Pharaoh Pursues the Israelites"
    },
    {
      "verse": 15,
      "title": "Parting the Red Sea"
    }
  ],
  "exodus:15": [
    {
      "verse": 1,
      "title": "The Song at the Sea"
    },
    {
      "verse": 22,
      "title": "The Waters of Marah"
    }
  ],
  "exodus:16": [
    {
      "verse": 1,
      "title": "Manna and Quail from Heaven"
    },
    {
      "verse": 22,
      "title": "The Sabbath Observed"
    },
    {
      "verse": 31,
      "title": "The Jar of Manna"
    }
  ],
  "exodus:17": [
    {
      "verse": 1,
      "title": "Water from the Rock"
    },
    {
      "verse": 8,
      "title": "The Defeat of the Amalekites"
    }
  ],
  "exodus:18": [
    {
      "verse": 1,
      "title": "The Visit of Jethro"
    },
    {
      "verse": 13,
      "title": "Jethro Advises Moses"
    }
  ],
  "exodus:19": [
    {
      "verse": 1,
      "title": "Israel at Mount Sinai"
    },
    {
      "verse": 16,
      "title": "The LORD Visits Sinai"
    }
  ],
  "exodus:20": [
    {
      "verse": 1,
      "title": "The Ten Commandments"
    },
    {
      "verse": 18,
      "title": "Moses Comforts the People"
    },
    {
      "verse": 22,
      "title": "Idolatry Forbidden"
    }
  ],
  "exodus:21": [
    {
      "verse": 1,
      "title": "Hebrew Servants"
    },
    {
      "verse": 12,
      "title": "Personal Injury Laws"
    }
  ],
  "exodus:22": [
    {
      "verse": 1,
      "title": "Property Laws"
    },
    {
      "verse": 16,
      "title": "Laws of Social Responsibility"
    }
  ],
  "exodus:23": [
    {
      "verse": 1,
      "title": "Justice and Mercy"
    },
    {
      "verse": 10,
      "title": "Sabbath Laws"
    },
    {
      "verse": 14,
      "title": "The Three Feasts of Pilgrimage"
    },
    {
      "verse": 20,
      "title": "God’s Angel to Lead"
    }
  ],
  "exodus:24": [
    {
      "verse": 1,
      "title": "The Covenant Sealed"
    },
    {
      "verse": 12,
      "title": "Moses on the Mountain"
    }
  ],
  "exodus:25": [
    {
      "verse": 1,
      "title": "Offerings for the Tabernacle"
    },
    {
      "verse": 10,
      "title": "The Ark of the Covenant"
    },
    {
      "verse": 17,
      "title": "The Mercy Seat"
    },
    {
      "verse": 23,
      "title": "The Table of Showbread"
    },
    {
      "verse": 31,
      "title": "The Lampstand"
    }
  ],
  "exodus:26": [
    {
      "verse": 1,
      "title": "The Ten Curtains for the Tabernacle"
    },
    {
      "verse": 7,
      "title": "The Eleven Curtains of Goat Hair"
    },
    {
      "verse": 15,
      "title": "The Frames and Bases"
    },
    {
      "verse": 31,
      "title": "The Veil"
    },
    {
      "verse": 36,
      "title": "The Curtain for the Entrance"
    }
  ],
  "exodus:27": [
    {
      "verse": 1,
      "title": "The Bronze Altar"
    },
    {
      "verse": 9,
      "title": "The Courtyard"
    },
    {
      "verse": 20,
      "title": "The Oil for the Lamps"
    }
  ],
  "exodus:28": [
    {
      "verse": 1,
      "title": "Garments for the Priests"
    },
    {
      "verse": 6,
      "title": "The Ephod"
    },
    {
      "verse": 15,
      "title": "The Breastpiece"
    },
    {
      "verse": 31,
      "title": "Additional Priestly Garments"
    }
  ],
  "exodus:29": [
    {
      "verse": 1,
      "title": "Consecration of the Priests"
    },
    {
      "verse": 10,
      "title": "The Order of the Sacrifices"
    },
    {
      "verse": 31,
      "title": "Food for the Priests"
    },
    {
      "verse": 38,
      "title": "The Daily Offerings"
    },
    {
      "verse": 45,
      "title": "God Will Dwell among the People"
    }
  ],
  "exodus:30": [
    {
      "verse": 1,
      "title": "The Altar of Incense"
    },
    {
      "verse": 11,
      "title": "The Census Offering"
    },
    {
      "verse": 17,
      "title": "The Bronze Basin"
    },
    {
      "verse": 22,
      "title": "The Anointing Oil"
    },
    {
      "verse": 34,
      "title": "The Incense"
    }
  ],
  "exodus:31": [
    {
      "verse": 1,
      "title": "Bezalel and Oholiab"
    },
    {
      "verse": 12,
      "title": "The Sign of the Sabbath"
    },
    {
      "verse": 18,
      "title": "Moses Receives the Tablets"
    }
  ],
  "exodus:32": [
    {
      "verse": 1,
      "title": "The Golden Calf"
    }
  ],
  "exodus:33": [
    {
      "verse": 1,
      "title": "The Command to Leave Sinai"
    },
    {
      "verse": 7,
      "title": "The Tent of Meeting"
    },
    {
      "verse": 12,
      "title": "The Promise of God’s Presence"
    }
  ],
  "exodus:34": [
    {
      "verse": 1,
      "title": "New Stone Tablets"
    },
    {
      "verse": 10,
      "title": "The LORD Renews the Covenant"
    }
  ],
  "exodus:35": [
    {
      "verse": 1,
      "title": "The Sabbath"
    },
    {
      "verse": 4,
      "title": "Offerings for the Tabernacle"
    },
    {
      "verse": 10,
      "title": "The Skilled Craftsmen"
    },
    {
      "verse": 20,
      "title": "The People Offer Gifts"
    },
    {
      "verse": 30,
      "title": "Bezalel and Oholiab"
    }
  ],
  "exodus:36": [
    {
      "verse": 1,
      "title": "The People Bring More than Enough"
    },
    {
      "verse": 8,
      "title": "The Ten Curtains for the Tabernacle"
    },
    {
      "verse": 14,
      "title": "The Eleven Curtains of Goat Hair"
    },
    {
      "verse": 20,
      "title": "The Frames and Bases"
    },
    {
      "verse": 35,
      "title": "The Veil"
    },
    {
      "verse": 37,
      "title": "The Curtain for the Entrance"
    }
  ],
  "exodus:37": [
    {
      "verse": 1,
      "title": "Constructing the Ark"
    },
    {
      "verse": 6,
      "title": "The Mercy Seat"
    },
    {
      "verse": 10,
      "title": "The Table of Showbread"
    },
    {
      "verse": 17,
      "title": "The Lampstand"
    },
    {
      "verse": 25,
      "title": "The Altar of Incense"
    }
  ],
  "exodus:38": [
    {
      "verse": 1,
      "title": "The Bronze Altar"
    },
    {
      "verse": 8,
      "title": "The Bronze Basin"
    },
    {
      "verse": 9,
      "title": "The Courtyard"
    },
    {
      "verse": 21,
      "title": "An Inventory of Materials"
    }
  ],
  "exodus:39": [
    {
      "verse": 1,
      "title": "The Ephod"
    },
    {
      "verse": 8,
      "title": "The Breastpiece"
    },
    {
      "verse": 22,
      "title": "Additional Priestly Garments"
    },
    {
      "verse": 32,
      "title": "Moses Approves the Work"
    }
  ],
  "exodus:40": [
    {
      "verse": 1,
      "title": "Setting Up the Tabernacle"
    },
    {
      "verse": 34,
      "title": "The Cloud and the Glory"
    }
  ],
  "leviticus:1": [
    {
      "verse": 1,
      "title": "Laws for Burnt Offerings"
    }
  ],
  "leviticus:2": [
    {
      "verse": 1,
      "title": "Laws for Grain Offerings"
    }
  ],
  "leviticus:3": [
    {
      "verse": 1,
      "title": "Laws for Peace Offerings"
    }
  ],
  "leviticus:4": [
    {
      "verse": 1,
      "title": "Laws for Sin Offerings"
    }
  ],
  "leviticus:5": [
    {
      "verse": 1,
      "title": "Sins Requiring a Sin Offering"
    },
    {
      "verse": 14,
      "title": "Laws for Guilt Offerings"
    }
  ],
  "leviticus:6": [
    {
      "verse": 1,
      "title": "Sins Requiring a Guilt Offering"
    },
    {
      "verse": 8,
      "title": "The Burnt Offering"
    },
    {
      "verse": 14,
      "title": "The Grain Offering"
    },
    {
      "verse": 24,
      "title": "The Sin Offering"
    }
  ],
  "leviticus:7": [
    {
      "verse": 1,
      "title": "The Guilt Offering"
    },
    {
      "verse": 11,
      "title": "The Peace Offering"
    },
    {
      "verse": 22,
      "title": "Fat and Blood Forbidden"
    },
    {
      "verse": 28,
      "title": "The Priests’ Portion"
    }
  ],
  "leviticus:8": [
    {
      "verse": 1,
      "title": "Moses Consecrates Aaron and His Sons"
    },
    {
      "verse": 14,
      "title": "The Priests’ Sin Offering"
    },
    {
      "verse": 18,
      "title": "The Priests’ Burnt Offering"
    },
    {
      "verse": 22,
      "title": "The Ram of Ordination"
    }
  ],
  "leviticus:9": [
    {
      "verse": 1,
      "title": "Aaron’s First Offerings"
    }
  ],
  "leviticus:10": [
    {
      "verse": 1,
      "title": "The Sin of Nadab and Abihu"
    },
    {
      "verse": 8,
      "title": "Restrictions for Priests"
    }
  ],
  "leviticus:11": [
    {
      "verse": 1,
      "title": "Clean and Unclean Animals"
    }
  ],
  "leviticus:12": [
    {
      "verse": 1,
      "title": "Purification after Childbirth"
    }
  ],
  "leviticus:13": [
    {
      "verse": 1,
      "title": "Laws about Skin Diseases"
    },
    {
      "verse": 47,
      "title": "Laws about Mildew"
    }
  ],
  "leviticus:14": [
    {
      "verse": 1,
      "title": "Cleansing from Skin Diseases"
    },
    {
      "verse": 33,
      "title": "Signs of Home Contamination"
    },
    {
      "verse": 48,
      "title": "Cleansing a Home"
    }
  ],
  "leviticus:15": [
    {
      "verse": 1,
      "title": "The Uncleanness of Men"
    },
    {
      "verse": 13,
      "title": "The Cleansing of Men"
    },
    {
      "verse": 19,
      "title": "The Uncleanness of Women"
    },
    {
      "verse": 28,
      "title": "The Cleansing of Women"
    }
  ],
  "leviticus:16": [
    {
      "verse": 1,
      "title": "The Day of Atonement"
    }
  ],
  "leviticus:17": [
    {
      "verse": 1,
      "title": "The Place of Sacrifice"
    },
    {
      "verse": 10,
      "title": "Laws against Eating Blood"
    }
  ],
  "leviticus:18": [
    {
      "verse": 1,
      "title": "Unlawful Sexual Relations"
    }
  ],
  "leviticus:19": [
    {
      "verse": 1,
      "title": "Commandments for Holiness"
    },
    {
      "verse": 9,
      "title": "Love Your Neighbor"
    },
    {
      "verse": 19,
      "title": "Keep My Statutes"
    }
  ],
  "leviticus:20": [
    {
      "verse": 1,
      "title": "Punishments for Disobedience"
    },
    {
      "verse": 10,
      "title": "Punishments for Sexual Immorality"
    },
    {
      "verse": 22,
      "title": "Distinguish between Clean and Unclean"
    }
  ],
  "leviticus:21": [
    {
      "verse": 1,
      "title": "Holiness Required of Priests"
    },
    {
      "verse": 16,
      "title": "Restrictions against Those with Blemishes"
    }
  ],
  "leviticus:22": [
    {
      "verse": 1,
      "title": "Restrictions against the Unclean"
    },
    {
      "verse": 17,
      "title": "Worthy Offerings"
    }
  ],
  "leviticus:23": [
    {
      "verse": 1,
      "title": "Feasts and Sabbaths"
    },
    {
      "verse": 4,
      "title": "Passover and the Feast of Unleavened Bread"
    },
    {
      "verse": 9,
      "title": "The Feast of Firstfruits"
    },
    {
      "verse": 15,
      "title": "The Feast of Weeks"
    },
    {
      "verse": 23,
      "title": "The Feast of Trumpets"
    },
    {
      "verse": 26,
      "title": "The Day of Atonement"
    },
    {
      "verse": 33,
      "title": "The Feast of Tabernacles"
    }
  ],
  "leviticus:24": [
    {
      "verse": 1,
      "title": "The Oil for the Lamps"
    },
    {
      "verse": 5,
      "title": "The Showbread"
    },
    {
      "verse": 10,
      "title": "Punishment for Blasphemy"
    },
    {
      "verse": 17,
      "title": "An Eye for an Eye"
    }
  ],
  "leviticus:25": [
    {
      "verse": 1,
      "title": "The Seventh Year"
    },
    {
      "verse": 8,
      "title": "The Year of Jubilee"
    },
    {
      "verse": 13,
      "title": "Return of Property"
    },
    {
      "verse": 18,
      "title": "The Blessing of Obedience"
    },
    {
      "verse": 23,
      "title": "The Law of Redemption"
    },
    {
      "verse": 35,
      "title": "Redemption of the Poor"
    },
    {
      "verse": 39,
      "title": "Redemption of Bondmen"
    },
    {
      "verse": 47,
      "title": "Redemption of Servants"
    }
  ],
  "leviticus:26": [
    {
      "verse": 1,
      "title": "Additional Blessings of Obedience"
    },
    {
      "verse": 14,
      "title": "Punishments for Disobedience"
    },
    {
      "verse": 40,
      "title": "God Remembers Those Who Repent"
    }
  ],
  "leviticus:27": [
    {
      "verse": 1,
      "title": "Rules about Valuations"
    },
    {
      "verse": 30,
      "title": "Instruction on Tithes"
    }
  ],
  "numbers:1": [
    {
      "verse": 1,
      "title": "The First Census of Israel"
    },
    {
      "verse": 5,
      "title": "The Leaders of the Tribes"
    },
    {
      "verse": 17,
      "title": "The Number of Every Tribe"
    },
    {
      "verse": 47,
      "title": "The Exemption of the Levites"
    }
  ],
  "numbers:2": [
    {
      "verse": 1,
      "title": "The Order of the Camps"
    }
  ],
  "numbers:3": [
    {
      "verse": 1,
      "title": "The Sons of Aaron"
    },
    {
      "verse": 5,
      "title": "The Duties of the Levites"
    },
    {
      "verse": 14,
      "title": "The Numbering of the Levites"
    },
    {
      "verse": 21,
      "title": "The Gershonites"
    },
    {
      "verse": 27,
      "title": "The Kohathites"
    },
    {
      "verse": 33,
      "title": "The Merarites"
    },
    {
      "verse": 38,
      "title": "Moses and Aaron"
    },
    {
      "verse": 40,
      "title": "The Redemption of the Firstborn"
    }
  ],
  "numbers:4": [
    {
      "verse": 1,
      "title": "The Duties of the Kohathites"
    },
    {
      "verse": 21,
      "title": "The Duties of the Gershonites"
    },
    {
      "verse": 29,
      "title": "The Duties of the Merarites"
    },
    {
      "verse": 34,
      "title": "The Numbering of the Levite Clans"
    }
  ],
  "numbers:5": [
    {
      "verse": 1,
      "title": "Cleansing the Camps"
    },
    {
      "verse": 5,
      "title": "Confession and Restitution"
    },
    {
      "verse": 11,
      "title": "The Adultery Test"
    }
  ],
  "numbers:6": [
    {
      "verse": 1,
      "title": "The Nazirite Vow"
    },
    {
      "verse": 22,
      "title": "Aaron’s Blessing"
    }
  ],
  "numbers:7": [
    {
      "verse": 1,
      "title": "Offerings of Dedication"
    }
  ],
  "numbers:8": [
    {
      "verse": 1,
      "title": "The Lampstand"
    },
    {
      "verse": 5,
      "title": "Cleansing the Levites"
    },
    {
      "verse": 23,
      "title": "Retirement for Levites"
    }
  ],
  "numbers:9": [
    {
      "verse": 1,
      "title": "The Second Passover"
    },
    {
      "verse": 15,
      "title": "The Cloud above the Tabernacle"
    }
  ],
  "numbers:10": [
    {
      "verse": 1,
      "title": "The Two Silver Trumpets"
    },
    {
      "verse": 11,
      "title": "From Sinai to Paran"
    }
  ],
  "numbers:11": [
    {
      "verse": 1,
      "title": "The Complaints of the People"
    },
    {
      "verse": 10,
      "title": "The Complaint of Moses"
    },
    {
      "verse": 16,
      "title": "Seventy Elders Anointed"
    },
    {
      "verse": 31,
      "title": "The Quail and the Plague"
    }
  ],
  "numbers:12": [
    {
      "verse": 1,
      "title": "The Complaint of Miriam and Aaron"
    }
  ],
  "numbers:13": [
    {
      "verse": 1,
      "title": "The Spies Explore Canaan"
    },
    {
      "verse": 25,
      "title": "The Reports of the Spies"
    }
  ],
  "numbers:14": [
    {
      "verse": 1,
      "title": "Israel’s Rebellion"
    },
    {
      "verse": 13,
      "title": "Moses Intercedes for Israel"
    },
    {
      "verse": 20,
      "title": "God’s Forgiveness and Judgment"
    },
    {
      "verse": 36,
      "title": "The Plague on the Ten Spies"
    },
    {
      "verse": 40,
      "title": "The Defeat at Hormah"
    }
  ],
  "numbers:15": [
    {
      "verse": 1,
      "title": "Laws about Offerings"
    },
    {
      "verse": 22,
      "title": "Offerings for Unintentional Sins"
    },
    {
      "verse": 32,
      "title": "A Sabbath-Breaker Stoned"
    },
    {
      "verse": 37,
      "title": "The Law of Tassels"
    }
  ],
  "numbers:16": [
    {
      "verse": 1,
      "title": "Korah’s Rebellion"
    },
    {
      "verse": 23,
      "title": "Moses Separates the People"
    },
    {
      "verse": 28,
      "title": "The Earth Swallows Korah"
    },
    {
      "verse": 36,
      "title": "The Censers Reserved for Holy Use"
    },
    {
      "verse": 41,
      "title": "Murmuring and Plague"
    }
  ],
  "numbers:17": [
    {
      "verse": 1,
      "title": "Aaron’s Staff Buds"
    }
  ],
  "numbers:18": [
    {
      "verse": 1,
      "title": "Duties of Priests and Levites"
    },
    {
      "verse": 8,
      "title": "Offerings for Priests and Levites"
    }
  ],
  "numbers:19": [
    {
      "verse": 1,
      "title": "The Red Heifer"
    },
    {
      "verse": 11,
      "title": "Purification of the Unclean"
    }
  ],
  "numbers:20": [
    {
      "verse": 1,
      "title": "Water from the Rock"
    },
    {
      "verse": 14,
      "title": "Edom Refuses Passage"
    },
    {
      "verse": 22,
      "title": "The Death of Aaron"
    }
  ],
  "numbers:21": [
    {
      "verse": 1,
      "title": "The Defeat of Arad"
    },
    {
      "verse": 4,
      "title": "The Bronze Serpent"
    },
    {
      "verse": 10,
      "title": "The Journey to Moab"
    },
    {
      "verse": 21,
      "title": "The Defeat of Sihon"
    },
    {
      "verse": 31,
      "title": "The Defeat of Og"
    }
  ],
  "numbers:22": [
    {
      "verse": 1,
      "title": "Balak Summons Balaam"
    },
    {
      "verse": 22,
      "title": "The Angel and Balaam’s Donkey"
    }
  ],
  "numbers:23": [
    {
      "verse": 1,
      "title": "Balaam’s First Oracle"
    },
    {
      "verse": 13,
      "title": "Balaam’s Second Oracle"
    }
  ],
  "numbers:24": [
    {
      "verse": 1,
      "title": "Balaam’s Third Oracle"
    },
    {
      "verse": 10,
      "title": "Balak Dismisses Balaam"
    },
    {
      "verse": 15,
      "title": "Balaam’s Fourth Oracle"
    },
    {
      "verse": 20,
      "title": "Balaam’s Final Three Oracles"
    }
  ],
  "numbers:25": [
    {
      "verse": 1,
      "title": "Moab Seduces Israel"
    },
    {
      "verse": 6,
      "title": "The Zeal of Phinehas"
    }
  ],
  "numbers:26": [
    {
      "verse": 1,
      "title": "The Second Census of Israel"
    },
    {
      "verse": 5,
      "title": "The Tribe of Reuben"
    },
    {
      "verse": 12,
      "title": "The Tribe of Simeon"
    },
    {
      "verse": 15,
      "title": "The Tribe of Gad"
    },
    {
      "verse": 19,
      "title": "The Tribe of Judah"
    },
    {
      "verse": 23,
      "title": "The Tribe of Issachar"
    },
    {
      "verse": 26,
      "title": "The Tribe of Zebulun"
    },
    {
      "verse": 28,
      "title": "The Tribe of Manasseh"
    },
    {
      "verse": 35,
      "title": "The Tribe of Ephraim"
    },
    {
      "verse": 38,
      "title": "The Tribe of Benjamin"
    },
    {
      "verse": 42,
      "title": "The Tribe of Dan"
    },
    {
      "verse": 44,
      "title": "The Tribe of Asher"
    },
    {
      "verse": 48,
      "title": "The Tribe of Naphtali"
    },
    {
      "verse": 52,
      "title": "Inheritance by Lot"
    },
    {
      "verse": 57,
      "title": "The Levites Numbered"
    },
    {
      "verse": 63,
      "title": "Only Caleb and Joshua Remain"
    }
  ],
  "numbers:27": [
    {
      "verse": 1,
      "title": "The Daughters of Zelophehad"
    },
    {
      "verse": 12,
      "title": "Moses Requests a Successor"
    },
    {
      "verse": 18,
      "title": "Joshua to Succeed Moses"
    }
  ],
  "numbers:28": [
    {
      "verse": 1,
      "title": "The Daily Offerings"
    },
    {
      "verse": 9,
      "title": "The Sabbath Offerings"
    },
    {
      "verse": 11,
      "title": "The Monthly Offerings"
    },
    {
      "verse": 16,
      "title": "Passover and the Feast of Unleavened Bread"
    },
    {
      "verse": 26,
      "title": "The Feast of Weeks"
    }
  ],
  "numbers:29": [
    {
      "verse": 1,
      "title": "The Feast of Trumpets"
    },
    {
      "verse": 7,
      "title": "The Day of Atonement"
    },
    {
      "verse": 12,
      "title": "The Feast of Tabernacles"
    }
  ],
  "numbers:30": [
    {
      "verse": 1,
      "title": "Laws about Vows"
    }
  ],
  "numbers:31": [
    {
      "verse": 1,
      "title": "Vengeance on Midian"
    },
    {
      "verse": 25,
      "title": "Division of the Spoils"
    },
    {
      "verse": 48,
      "title": "The Voluntary Offering"
    }
  ],
  "numbers:32": [
    {
      "verse": 1,
      "title": "The Tribes East of the Jordan"
    }
  ],
  "numbers:33": [
    {
      "verse": 1,
      "title": "Forty-Two Journeys of the Israelites"
    },
    {
      "verse": 50,
      "title": "Instructions for Occupying Canaan"
    }
  ],
  "numbers:34": [
    {
      "verse": 1,
      "title": "The Boundaries of Canaan"
    },
    {
      "verse": 16,
      "title": "Leaders to Divide the Land"
    }
  ],
  "numbers:35": [
    {
      "verse": 1,
      "title": "Forty-Eight Cities for the Levites"
    },
    {
      "verse": 9,
      "title": "Six Cities of Refuge"
    }
  ],
  "numbers:36": [
    {
      "verse": 1,
      "title": "Zelophehad’s Daughters Marry"
    }
  ],
  "deuteronomy:1": [
    {
      "verse": 1,
      "title": "The Command to Leave Horeb"
    },
    {
      "verse": 9,
      "title": "Moses Appoints Leaders"
    },
    {
      "verse": 19,
      "title": "Twelve Spies Sent Out"
    },
    {
      "verse": 26,
      "title": "Israel’s Rebellion"
    },
    {
      "verse": 34,
      "title": "Israel’s Penalty"
    },
    {
      "verse": 41,
      "title": "The Defeat at Hormah"
    }
  ],
  "deuteronomy:2": [
    {
      "verse": 1,
      "title": "Wanderings in the Wilderness"
    },
    {
      "verse": 24,
      "title": "The Defeat of Sihon"
    }
  ],
  "deuteronomy:3": [
    {
      "verse": 1,
      "title": "The Defeat of Og"
    },
    {
      "verse": 12,
      "title": "Land Division East of the Jordan"
    },
    {
      "verse": 23,
      "title": "Moses Forbidden to Cross the Jordan"
    }
  ],
  "deuteronomy:4": [
    {
      "verse": 1,
      "title": "An Exhortation to Obedience"
    },
    {
      "verse": 15,
      "title": "A Warning against Idolatry"
    },
    {
      "verse": 32,
      "title": "The LORD Alone Is God"
    },
    {
      "verse": 41,
      "title": "Cities of Refuge"
    },
    {
      "verse": 44,
      "title": "Introduction to the Law"
    }
  ],
  "deuteronomy:5": [
    {
      "verse": 1,
      "title": "The Covenant at Horeb"
    },
    {
      "verse": 5,
      "title": "The Ten Commandments"
    },
    {
      "verse": 22,
      "title": "Moses Intercedes for the People"
    }
  ],
  "deuteronomy:6": [
    {
      "verse": 1,
      "title": "The Greatest Commandment"
    },
    {
      "verse": 20,
      "title": "Teach Your Children"
    }
  ],
  "deuteronomy:7": [
    {
      "verse": 1,
      "title": "Drive Out the Nations"
    },
    {
      "verse": 12,
      "title": "The Promises of God"
    }
  ],
  "deuteronomy:8": [
    {
      "verse": 1,
      "title": "Remember the LORD Your God"
    }
  ],
  "deuteronomy:9": [
    {
      "verse": 1,
      "title": "Assurance of Victory"
    },
    {
      "verse": 7,
      "title": "The Golden Calf"
    }
  ],
  "deuteronomy:10": [
    {
      "verse": 1,
      "title": "New Stone Tablets"
    },
    {
      "verse": 12,
      "title": "A Call to Obedience"
    }
  ],
  "deuteronomy:11": [
    {
      "verse": 1,
      "title": "Obedience and Discipline"
    },
    {
      "verse": 8,
      "title": "God’s Great Blessings"
    },
    {
      "verse": 18,
      "title": "Remember God’s Words"
    },
    {
      "verse": 26,
      "title": "A Blessing and a Curse"
    }
  ],
  "deuteronomy:12": [
    {
      "verse": 1,
      "title": "One Place for Worship"
    },
    {
      "verse": 29,
      "title": "A Warning against Idolatry"
    }
  ],
  "deuteronomy:13": [
    {
      "verse": 1,
      "title": "Idolaters to Be Put to Death"
    },
    {
      "verse": 12,
      "title": "Idolatrous Cities to Be Destroyed"
    }
  ],
  "deuteronomy:14": [
    {
      "verse": 1,
      "title": "Clean and Unclean Animals"
    },
    {
      "verse": 22,
      "title": "Giving Tithes"
    }
  ],
  "deuteronomy:15": [
    {
      "verse": 1,
      "title": "The Seventh Year"
    },
    {
      "verse": 7,
      "title": "Generosity in Lending and Giving"
    },
    {
      "verse": 12,
      "title": "Hebrew Servants"
    },
    {
      "verse": 19,
      "title": "Firstborn Animals"
    }
  ],
  "deuteronomy:16": [
    {
      "verse": 1,
      "title": "Passover and the Feast of Unleavened Bread"
    },
    {
      "verse": 9,
      "title": "The Feast of Weeks"
    },
    {
      "verse": 13,
      "title": "The Feast of Tabernacles"
    },
    {
      "verse": 18,
      "title": "Judges and Justice"
    },
    {
      "verse": 21,
      "title": "Forbidden Forms of Worship"
    }
  ],
  "deuteronomy:17": [
    {
      "verse": 1,
      "title": "Detestable Sacrifices"
    },
    {
      "verse": 2,
      "title": "Purge the Idolater"
    },
    {
      "verse": 8,
      "title": "Courts of Law"
    },
    {
      "verse": 14,
      "title": "Guidelines for a King"
    }
  ],
  "deuteronomy:18": [
    {
      "verse": 1,
      "title": "Provision for Priests and Levites"
    },
    {
      "verse": 9,
      "title": "Sorcery Forbidden"
    },
    {
      "verse": 15,
      "title": "A Prophet Like Moses"
    }
  ],
  "deuteronomy:19": [
    {
      "verse": 1,
      "title": "Cities of Refuge"
    },
    {
      "verse": 15,
      "title": "The Testimony of Two or Three Witnesses"
    }
  ],
  "deuteronomy:20": [
    {
      "verse": 1,
      "title": "Laws of Warfare"
    }
  ],
  "deuteronomy:21": [
    {
      "verse": 1,
      "title": "Atonement for an Unsolved Murder"
    },
    {
      "verse": 10,
      "title": "Marrying a Captive Woman"
    },
    {
      "verse": 15,
      "title": "Inheritance Rights of the Firstborn"
    },
    {
      "verse": 18,
      "title": "A Rebellious Son"
    },
    {
      "verse": 22,
      "title": "Cursed Is Anyone Hung on a Tree"
    }
  ],
  "deuteronomy:22": [
    {
      "verse": 1,
      "title": "Various Laws"
    },
    {
      "verse": 13,
      "title": "Marriage Violations"
    }
  ],
  "deuteronomy:23": [
    {
      "verse": 1,
      "title": "Exclusion from the Congregation"
    },
    {
      "verse": 9,
      "title": "Uncleanness in the Camp"
    },
    {
      "verse": 15,
      "title": "Miscellaneous Laws"
    }
  ],
  "deuteronomy:24": [
    {
      "verse": 1,
      "title": "Marriage and Divorce Laws"
    },
    {
      "verse": 6,
      "title": "Additional Laws"
    }
  ],
  "deuteronomy:25": [
    {
      "verse": 1,
      "title": "Fairness and Mercy"
    },
    {
      "verse": 5,
      "title": "Widowhood and Marriage"
    },
    {
      "verse": 13,
      "title": "Standard Weights and Measures"
    },
    {
      "verse": 17,
      "title": "Revenge on the Amalekites"
    }
  ],
  "deuteronomy:26": [
    {
      "verse": 1,
      "title": "Offering Firstfruits and Tithes"
    },
    {
      "verse": 16,
      "title": "Obey the LORD’s Commands"
    }
  ],
  "deuteronomy:27": [
    {
      "verse": 1,
      "title": "The Altar on Mount Ebal"
    },
    {
      "verse": 11,
      "title": "Curses Pronounced from Ebal"
    }
  ],
  "deuteronomy:28": [
    {
      "verse": 1,
      "title": "The Blessings of Obedience"
    },
    {
      "verse": 15,
      "title": "The Curses of Disobedience"
    }
  ],
  "deuteronomy:29": [
    {
      "verse": 1,
      "title": "The Covenant in Moab"
    }
  ],
  "deuteronomy:30": [
    {
      "verse": 1,
      "title": "The Promise of Restoration"
    },
    {
      "verse": 11,
      "title": "The Choice of Life or Death"
    }
  ],
  "deuteronomy:31": [
    {
      "verse": 1,
      "title": "Joshua to Succeed Moses"
    },
    {
      "verse": 9,
      "title": "The Reading of the Law"
    },
    {
      "verse": 14,
      "title": "God Commissions Joshua"
    },
    {
      "verse": 24,
      "title": "The Law Placed in the Ark"
    },
    {
      "verse": 30,
      "title": "Moses Begins His Song"
    }
  ],
  "deuteronomy:32": [
    {
      "verse": 1,
      "title": "The Song of Moses"
    },
    {
      "verse": 48,
      "title": "Moses’ Death Foretold"
    }
  ],
  "deuteronomy:33": [
    {
      "verse": 1,
      "title": "Moses Blesses the Twelve Tribes"
    }
  ],
  "deuteronomy:34": [
    {
      "verse": 1,
      "title": "The Death of Moses"
    }
  ],
  "joshua:1": [
    {
      "verse": 1,
      "title": "God Instructs Joshua"
    },
    {
      "verse": 10,
      "title": "Joshua Takes Charge"
    }
  ],
  "joshua:2": [
    {
      "verse": 1,
      "title": "Rahab Welcomes the Spies"
    },
    {
      "verse": 8,
      "title": "The Promise to Rahab"
    }
  ],
  "joshua:3": [
    {
      "verse": 1,
      "title": "Crossing the Jordan"
    }
  ],
  "joshua:4": [
    {
      "verse": 1,
      "title": "Twelve Stones from the Jordan"
    },
    {
      "verse": 19,
      "title": "The Camp at Gilgal"
    }
  ],
  "joshua:5": [
    {
      "verse": 1,
      "title": "The Circumcision and Passover at Gilgal"
    },
    {
      "verse": 13,
      "title": "The Commander of the LORD’s Army"
    }
  ],
  "joshua:6": [
    {
      "verse": 1,
      "title": "The Walls of Jericho"
    }
  ],
  "joshua:7": [
    {
      "verse": 1,
      "title": "The Defeat at Ai"
    },
    {
      "verse": 16,
      "title": "The Sin of Achan"
    }
  ],
  "joshua:8": [
    {
      "verse": 1,
      "title": "The Conquest of Ai"
    },
    {
      "verse": 30,
      "title": "Joshua Renews the Covenant"
    }
  ],
  "joshua:9": [
    {
      "verse": 1,
      "title": "The Deceit of the Gibeonites"
    }
  ],
  "joshua:10": [
    {
      "verse": 1,
      "title": "The Day the Sun Stood Still"
    },
    {
      "verse": 16,
      "title": "The Victory at Makkedah"
    },
    {
      "verse": 29,
      "title": "Conquest of the Southern Cities"
    }
  ],
  "joshua:11": [
    {
      "verse": 1,
      "title": "Conquest of the Northern Cities"
    },
    {
      "verse": 16,
      "title": "Joshua Takes the Whole Land"
    }
  ],
  "joshua:12": [
    {
      "verse": 1,
      "title": "The Kings Defeated East of the Jordan"
    },
    {
      "verse": 7,
      "title": "The Kings Defeated West of the Jordan"
    }
  ],
  "joshua:13": [
    {
      "verse": 1,
      "title": "Lands Yet Unconquered"
    },
    {
      "verse": 8,
      "title": "The Inheritance East of the Jordan"
    },
    {
      "verse": 15,
      "title": "Reuben’s Inheritance"
    },
    {
      "verse": 24,
      "title": "Gad’s Inheritance"
    },
    {
      "verse": 29,
      "title": "Manasseh’s Eastern Inheritance"
    }
  ],
  "joshua:14": [
    {
      "verse": 1,
      "title": "Land Division West of the Jordan"
    },
    {
      "verse": 6,
      "title": "Caleb Requests Hebron"
    }
  ],
  "joshua:15": [
    {
      "verse": 1,
      "title": "Judah’s Inheritance"
    },
    {
      "verse": 13,
      "title": "Caleb’s Portion and Conquest"
    },
    {
      "verse": 20,
      "title": "The Cities of Judah"
    }
  ],
  "joshua:16": [
    {
      "verse": 1,
      "title": "Ephraim’s Inheritance"
    }
  ],
  "joshua:17": [
    {
      "verse": 1,
      "title": "Manasseh’s Western Inheritance"
    }
  ],
  "joshua:18": [
    {
      "verse": 1,
      "title": "The Remainder Divided"
    },
    {
      "verse": 11,
      "title": "Benjamin’s Inheritance"
    }
  ],
  "joshua:19": [
    {
      "verse": 1,
      "title": "Simeon’s Inheritance"
    },
    {
      "verse": 10,
      "title": "Zebulun’s Inheritance"
    },
    {
      "verse": 17,
      "title": "Issachar’s Inheritance"
    },
    {
      "verse": 24,
      "title": "Asher’s Inheritance"
    },
    {
      "verse": 32,
      "title": "Naphtali’s Inheritance"
    },
    {
      "verse": 40,
      "title": "Dan’s Inheritance"
    },
    {
      "verse": 49,
      "title": "Joshua’s Inheritance"
    }
  ],
  "joshua:20": [
    {
      "verse": 1,
      "title": "Six Cities of Refuge"
    }
  ],
  "joshua:21": [
    {
      "verse": 1,
      "title": "Forty-Eight Cities for the Levites"
    }
  ],
  "joshua:22": [
    {
      "verse": 1,
      "title": "The Eastern Tribes Return Home"
    },
    {
      "verse": 9,
      "title": "The Altar of Witness"
    }
  ],
  "joshua:23": [
    {
      "verse": 1,
      "title": "Joshua’s Charge to Leaders"
    }
  ],
  "joshua:24": [
    {
      "verse": 1,
      "title": "Joshua Reviews Israel’s History"
    },
    {
      "verse": 14,
      "title": "Choose Whom You Will Serve"
    },
    {
      "verse": 29,
      "title": "Joshua’s Death and Burial"
    }
  ],
  "judges:1": [
    {
      "verse": 1,
      "title": "The Conquest of Canaan Proceeds"
    },
    {
      "verse": 8,
      "title": "The Capture of Jerusalem and Hebron"
    },
    {
      "verse": 27,
      "title": "The Failure to Complete the Conquest"
    }
  ],
  "judges:2": [
    {
      "verse": 1,
      "title": "Israel Rebuked at Bochim"
    },
    {
      "verse": 6,
      "title": "Joshua’s Death and Burial"
    },
    {
      "verse": 10,
      "title": "Israel’s Unfaithfulness"
    },
    {
      "verse": 16,
      "title": "Judges Raised Up"
    }
  ],
  "judges:3": [
    {
      "verse": 1,
      "title": "Nations Left to Test Israel"
    },
    {
      "verse": 7,
      "title": "Othniel"
    },
    {
      "verse": 12,
      "title": "Ehud"
    },
    {
      "verse": 31,
      "title": "Shamgar"
    }
  ],
  "judges:4": [
    {
      "verse": 1,
      "title": "Deborah and Barak"
    },
    {
      "verse": 17,
      "title": "Jael Kills Sisera"
    }
  ],
  "judges:5": [
    {
      "verse": 1,
      "title": "The Song of Deborah and Barak"
    }
  ],
  "judges:6": [
    {
      "verse": 1,
      "title": "Midian Oppresses Israel"
    },
    {
      "verse": 11,
      "title": "The Call of Gideon"
    },
    {
      "verse": 25,
      "title": "Gideon Destroys Baal’s Altar"
    },
    {
      "verse": 33,
      "title": "The Sign of the Fleece"
    }
  ],
  "judges:7": [
    {
      "verse": 1,
      "title": "Gideon’s Army of Three Hundred"
    },
    {
      "verse": 9,
      "title": "The Sword of Gideon"
    },
    {
      "verse": 15,
      "title": "Gideon Defeats Midian"
    }
  ],
  "judges:8": [
    {
      "verse": 1,
      "title": "Gideon Defeats Zebah and Zalmunna"
    },
    {
      "verse": 22,
      "title": "Gideon’s Ephod"
    },
    {
      "verse": 28,
      "title": "Forty Years of Peace"
    },
    {
      "verse": 32,
      "title": "Gideon’s Death"
    }
  ],
  "judges:9": [
    {
      "verse": 1,
      "title": "Abimelech’s Conspiracy"
    },
    {
      "verse": 7,
      "title": "Jotham’s Parable"
    },
    {
      "verse": 22,
      "title": "Gaal Conspires with the Shechemites"
    },
    {
      "verse": 30,
      "title": "The Fall of Shechem"
    },
    {
      "verse": 50,
      "title": "Abimelech’s Punishment"
    }
  ],
  "judges:10": [
    {
      "verse": 1,
      "title": "Tola"
    },
    {
      "verse": 3,
      "title": "Jair"
    },
    {
      "verse": 6,
      "title": "Oppression by the Philistines and Ammonites"
    }
  ],
  "judges:11": [
    {
      "verse": 1,
      "title": "Jephthah Delivers Israel"
    },
    {
      "verse": 29,
      "title": "Jephthah’s Tragic Vow"
    }
  ],
  "judges:12": [
    {
      "verse": 1,
      "title": "Jephthah Defeats Ephraim"
    },
    {
      "verse": 8,
      "title": "Ibzan, Elon, and Abdon"
    }
  ],
  "judges:13": [
    {
      "verse": 1,
      "title": "The Birth of Samson"
    }
  ],
  "judges:14": [
    {
      "verse": 1,
      "title": "Samson’s Marriage"
    },
    {
      "verse": 8,
      "title": "Samson’s Riddle"
    }
  ],
  "judges:15": [
    {
      "verse": 1,
      "title": "Samson’s Revenge"
    }
  ],
  "judges:16": [
    {
      "verse": 1,
      "title": "Samson Escapes Gaza"
    },
    {
      "verse": 4,
      "title": "Samson and Delilah"
    },
    {
      "verse": 15,
      "title": "Delilah Learns the Secret"
    },
    {
      "verse": 23,
      "title": "Samson’s Vengeance and Death"
    }
  ],
  "judges:17": [
    {
      "verse": 1,
      "title": "Micah’s Idolatry"
    }
  ],
  "judges:18": [
    {
      "verse": 1,
      "title": "The Danites Settle in Laish"
    },
    {
      "verse": 14,
      "title": "The Danites Take Micah’s Idols"
    }
  ],
  "judges:19": [
    {
      "verse": 1,
      "title": "The Crime of the Benjamites"
    }
  ],
  "judges:20": [
    {
      "verse": 1,
      "title": "The Decree of the Assembly"
    },
    {
      "verse": 18,
      "title": "Civil War against Benjamin"
    }
  ],
  "judges:21": [
    {
      "verse": 1,
      "title": "Wives for the Benjamites"
    }
  ],
  "ruth:1": [
    {
      "verse": 1,
      "title": "Naomi Becomes a Widow"
    },
    {
      "verse": 6,
      "title": "Ruth’s Loyalty to Naomi"
    },
    {
      "verse": 19,
      "title": "The Return to Bethlehem"
    }
  ],
  "ruth:2": [
    {
      "verse": 1,
      "title": "Boaz Meets Ruth"
    }
  ],
  "ruth:3": [
    {
      "verse": 1,
      "title": "Ruth’s Redemption Assured"
    }
  ],
  "ruth:4": [
    {
      "verse": 1,
      "title": "Boaz Redeems Ruth"
    },
    {
      "verse": 13,
      "title": "Boaz Marries Ruth"
    },
    {
      "verse": 18,
      "title": "The Line of David"
    }
  ],
  "1samuel:1": [
    {
      "verse": 1,
      "title": "Elkanah and His Wives"
    },
    {
      "verse": 9,
      "title": "Hannah Prays for a Son"
    },
    {
      "verse": 19,
      "title": "The Birth of Samuel"
    }
  ],
  "1samuel:2": [
    {
      "verse": 1,
      "title": "Hannah’s Prayer of Thanksgiving"
    },
    {
      "verse": 12,
      "title": "Eli’s Wicked Sons"
    },
    {
      "verse": 27,
      "title": "A Prophecy against the House of Eli"
    }
  ],
  "1samuel:3": [
    {
      "verse": 1,
      "title": "The LORD Calls Samuel"
    },
    {
      "verse": 15,
      "title": "Samuel Shares the Vision"
    }
  ],
  "1samuel:4": [
    {
      "verse": 1,
      "title": "The Philistines Capture the Ark"
    },
    {
      "verse": 12,
      "title": "The Death of Eli"
    }
  ],
  "1samuel:5": [
    {
      "verse": 1,
      "title": "The Ark Afflicts the Philistines"
    }
  ],
  "1samuel:6": [
    {
      "verse": 1,
      "title": "The Ark Returned to Israel"
    }
  ],
  "1samuel:7": [
    {
      "verse": 1,
      "title": "Samuel Subdues the Philistines"
    }
  ],
  "1samuel:8": [
    {
      "verse": 1,
      "title": "Israel Demands a King"
    },
    {
      "verse": 10,
      "title": "Samuel’s Warning"
    },
    {
      "verse": 19,
      "title": "God Grants the Request"
    }
  ],
  "1samuel:9": [
    {
      "verse": 1,
      "title": "Saul Chosen as King"
    }
  ],
  "1samuel:10": [
    {
      "verse": 1,
      "title": "Samuel Anoints Saul"
    },
    {
      "verse": 9,
      "title": "Samuel’s Signs Fulfilled"
    },
    {
      "verse": 17,
      "title": "Saul Proclaimed King"
    }
  ],
  "1samuel:11": [
    {
      "verse": 1,
      "title": "Saul Defeats the Ammonites"
    },
    {
      "verse": 12,
      "title": "Saul Confirmed as King"
    }
  ],
  "1samuel:12": [
    {
      "verse": 1,
      "title": "Samuel’s Farewell Address"
    }
  ],
  "1samuel:13": [
    {
      "verse": 1,
      "title": "War with the Philistines"
    },
    {
      "verse": 8,
      "title": "Saul’s Unlawful Sacrifice"
    },
    {
      "verse": 16,
      "title": "Israel without Weapons"
    }
  ],
  "1samuel:14": [
    {
      "verse": 1,
      "title": "Jonathan’s Victory over the Philistines"
    },
    {
      "verse": 24,
      "title": "Jonathan Eats the Honey"
    },
    {
      "verse": 37,
      "title": "The People Save Jonathan"
    },
    {
      "verse": 47,
      "title": "Saul’s Victories"
    }
  ],
  "1samuel:15": [
    {
      "verse": 1,
      "title": "Saul’s Disobedience"
    },
    {
      "verse": 10,
      "title": "Samuel Denounces Saul"
    },
    {
      "verse": 24,
      "title": "Saul’s Confession"
    }
  ],
  "1samuel:16": [
    {
      "verse": 1,
      "title": "Samuel Anoints David"
    },
    {
      "verse": 14,
      "title": "David Serves Saul"
    }
  ],
  "1samuel:17": [
    {
      "verse": 1,
      "title": "Goliath’s Challenge"
    },
    {
      "verse": 12,
      "title": "David Accepts the Challenge"
    },
    {
      "verse": 38,
      "title": "David Slays Goliath"
    }
  ],
  "1samuel:18": [
    {
      "verse": 1,
      "title": "Jonathan Befriends David"
    },
    {
      "verse": 5,
      "title": "Saul Envies David"
    },
    {
      "verse": 17,
      "title": "David Marries Michal"
    }
  ],
  "1samuel:19": [
    {
      "verse": 1,
      "title": "Saul Tries to Kill David"
    }
  ],
  "1samuel:20": [
    {
      "verse": 1,
      "title": "Jonathan Helps David"
    },
    {
      "verse": 10,
      "title": "Jonathan and David Renew Their Covenant"
    },
    {
      "verse": 30,
      "title": "Saul Seeks to Kill Jonathan"
    }
  ],
  "1samuel:21": [
    {
      "verse": 1,
      "title": "David Takes the Consecrated Bread"
    },
    {
      "verse": 8,
      "title": "David Flees to Gath"
    }
  ],
  "1samuel:22": [
    {
      "verse": 1,
      "title": "David Flees to Adullam and Mizpeh"
    },
    {
      "verse": 6,
      "title": "Saul Slays the Priests of Nob"
    }
  ],
  "1samuel:23": [
    {
      "verse": 1,
      "title": "David Delivers Keilah"
    },
    {
      "verse": 7,
      "title": "Saul Pursues David"
    }
  ],
  "1samuel:24": [
    {
      "verse": 1,
      "title": "David Spares Saul"
    },
    {
      "verse": 16,
      "title": "David’s Oath to Saul"
    }
  ],
  "1samuel:25": [
    {
      "verse": 1,
      "title": "The Death of Samuel"
    },
    {
      "verse": 2,
      "title": "David, Nabal, and Abigail"
    },
    {
      "verse": 18,
      "title": "Abigail Intercedes for Nabal"
    },
    {
      "verse": 39,
      "title": "David Marries Abigail"
    }
  ],
  "1samuel:26": [
    {
      "verse": 1,
      "title": "David Again Spares Saul"
    },
    {
      "verse": 13,
      "title": "David Reproves Abner"
    },
    {
      "verse": 21,
      "title": "Saul Acknowledges His Sin"
    }
  ],
  "1samuel:27": [
    {
      "verse": 1,
      "title": "David and the Philistines"
    }
  ],
  "1samuel:28": [
    {
      "verse": 1,
      "title": "The Philistines Gather against Israel"
    },
    {
      "verse": 7,
      "title": "Saul and the Medium of Endor"
    }
  ],
  "1samuel:29": [
    {
      "verse": 1,
      "title": "The Philistines Reject David"
    }
  ],
  "1samuel:30": [
    {
      "verse": 1,
      "title": "The Amalekites Raid Ziklag"
    },
    {
      "verse": 7,
      "title": "David Destroys the Amalekites"
    },
    {
      "verse": 21,
      "title": "The Spoils Are Divided"
    }
  ],
  "1samuel:31": [
    {
      "verse": 1,
      "title": "Saul’s Overthrow and Death"
    },
    {
      "verse": 7,
      "title": "The Philistines Possess the Towns"
    },
    {
      "verse": 11,
      "title": "Jabesh-gilead’s Tribute to Saul"
    }
  ],
  "2samuel:1": [
    {
      "verse": 1,
      "title": "Saul’s Death Reported to David"
    },
    {
      "verse": 17,
      "title": "David’s Song for Saul and Jonathan"
    }
  ],
  "2samuel:2": [
    {
      "verse": 1,
      "title": "David Anointed King of Judah"
    },
    {
      "verse": 8,
      "title": "Ish-bosheth Made King of Israel"
    },
    {
      "verse": 12,
      "title": "The Battle of Gibeon"
    }
  ],
  "2samuel:3": [
    {
      "verse": 1,
      "title": "The House of David Strengthened"
    },
    {
      "verse": 6,
      "title": "Abner Joins David"
    },
    {
      "verse": 22,
      "title": "Joab Murders Abner"
    },
    {
      "verse": 31,
      "title": "David Mourns for Abner"
    }
  ],
  "2samuel:4": [
    {
      "verse": 1,
      "title": "The Murder of Ish-bosheth"
    },
    {
      "verse": 9,
      "title": "The Execution of Rechab and Baanah"
    }
  ],
  "2samuel:5": [
    {
      "verse": 1,
      "title": "David Anointed King of All Israel"
    },
    {
      "verse": 6,
      "title": "David Conquers Jerusalem"
    },
    {
      "verse": 12,
      "title": "David’s Family Grows"
    },
    {
      "verse": 17,
      "title": "Two Victories over the Philistines"
    }
  ],
  "2samuel:6": [
    {
      "verse": 1,
      "title": "David Fetches the Ark"
    },
    {
      "verse": 5,
      "title": "Uzzah Touches the Ark"
    },
    {
      "verse": 12,
      "title": "The Ark Brought to Jerusalem"
    },
    {
      "verse": 16,
      "title": "Michal’s Contempt for David"
    }
  ],
  "2samuel:7": [
    {
      "verse": 1,
      "title": "God’s Covenant with David"
    },
    {
      "verse": 18,
      "title": "David’s Prayer of Thanksgiving"
    }
  ],
  "2samuel:8": [
    {
      "verse": 1,
      "title": "David’s Triumphs"
    },
    {
      "verse": 15,
      "title": "David’s Officers"
    }
  ],
  "2samuel:9": [
    {
      "verse": 1,
      "title": "David and Mephibosheth"
    }
  ],
  "2samuel:10": [
    {
      "verse": 1,
      "title": "David’s Messengers Disgraced"
    },
    {
      "verse": 9,
      "title": "David Defeats Ammon and Aram"
    }
  ],
  "2samuel:11": [
    {
      "verse": 1,
      "title": "David and Bathsheba"
    },
    {
      "verse": 14,
      "title": "David Arranges Uriah’s Death"
    },
    {
      "verse": 26,
      "title": "David Marries Bathsheba"
    }
  ],
  "2samuel:12": [
    {
      "verse": 1,
      "title": "Nathan Rebukes David"
    },
    {
      "verse": 13,
      "title": "David’s Loss and Repentance"
    },
    {
      "verse": 24,
      "title": "Solomon’s Birth"
    },
    {
      "verse": 26,
      "title": "The Capture of Rabbah"
    }
  ],
  "2samuel:13": [
    {
      "verse": 1,
      "title": "Amnon and Tamar"
    },
    {
      "verse": 23,
      "title": "Absalom’s Revenge on Amnon"
    },
    {
      "verse": 34,
      "title": "Absalom Flees to Geshur"
    }
  ],
  "2samuel:14": [
    {
      "verse": 1,
      "title": "Absalom’s Return to Jerusalem"
    },
    {
      "verse": 28,
      "title": "Absalom Reconciled to David"
    }
  ],
  "2samuel:15": [
    {
      "verse": 1,
      "title": "Absalom’s Conspiracy"
    },
    {
      "verse": 13,
      "title": "David Flees Jerusalem"
    },
    {
      "verse": 30,
      "title": "David Weeps at the Mount of Olives"
    }
  ],
  "2samuel:16": [
    {
      "verse": 1,
      "title": "David and Ziba"
    },
    {
      "verse": 5,
      "title": "Shimei Curses David"
    },
    {
      "verse": 15,
      "title": "The Counsel of Ahithophel and Hushai"
    }
  ],
  "2samuel:17": [
    {
      "verse": 1,
      "title": "Hushai Counters Ahithophel’s Advice"
    },
    {
      "verse": 15,
      "title": "Hushai’s Warning Saves David"
    }
  ],
  "2samuel:18": [
    {
      "verse": 1,
      "title": "Absalom Killed"
    },
    {
      "verse": 19,
      "title": "David Mourns for Absalom"
    }
  ],
  "2samuel:19": [
    {
      "verse": 1,
      "title": "Joab Reproves David"
    },
    {
      "verse": 8,
      "title": "David Restored as King"
    },
    {
      "verse": 16,
      "title": "Shimei Pardoned"
    },
    {
      "verse": 24,
      "title": "Mephibosheth Excused"
    },
    {
      "verse": 31,
      "title": "David’s Kindness to Barzillai"
    },
    {
      "verse": 41,
      "title": "Contention over the King"
    }
  ],
  "2samuel:20": [
    {
      "verse": 1,
      "title": "Sheba’s Rebellion"
    }
  ],
  "2samuel:21": [
    {
      "verse": 1,
      "title": "David Avenges the Gibeonites"
    },
    {
      "verse": 15,
      "title": "Four Battles against the Philistines"
    }
  ],
  "2samuel:22": [
    {
      "verse": 1,
      "title": "David’s Song of Deliverance"
    }
  ],
  "2samuel:23": [
    {
      "verse": 1,
      "title": "David’s Last Song"
    },
    {
      "verse": 8,
      "title": "David’s Mighty Men"
    }
  ],
  "2samuel:24": [
    {
      "verse": 1,
      "title": "David’s Military Census"
    },
    {
      "verse": 10,
      "title": "Judgment for David’s Sin"
    },
    {
      "verse": 15,
      "title": "A Plague on Israel"
    },
    {
      "verse": 18,
      "title": "David Builds an Altar"
    }
  ],
  "1kings:1": [
    {
      "verse": 1,
      "title": "Abishag Cares for David"
    },
    {
      "verse": 5,
      "title": "Adonijah Usurps the Kingdom"
    },
    {
      "verse": 11,
      "title": "Nathan and Bathsheba before David"
    },
    {
      "verse": 28,
      "title": "David Renews His Oath to Bathsheba"
    },
    {
      "verse": 32,
      "title": "Solomon Anointed King"
    },
    {
      "verse": 41,
      "title": "Adonijah Learns of Solomon’s Kingship"
    }
  ],
  "1kings:2": [
    {
      "verse": 1,
      "title": "David Instructs Solomon"
    },
    {
      "verse": 10,
      "title": "David’s Reign and Death"
    },
    {
      "verse": 13,
      "title": "The Execution of Adonijah"
    },
    {
      "verse": 28,
      "title": "The Execution of Joab"
    },
    {
      "verse": 36,
      "title": "The Execution of Shimei"
    }
  ],
  "1kings:3": [
    {
      "verse": 1,
      "title": "Solomon’s Prayer for Wisdom"
    },
    {
      "verse": 16,
      "title": "Solomon Judges Wisely"
    }
  ],
  "1kings:4": [
    {
      "verse": 1,
      "title": "Solomon’s Princes"
    },
    {
      "verse": 7,
      "title": "Solomon’s Twelve Officers"
    },
    {
      "verse": 20,
      "title": "Solomon’s Prosperity"
    },
    {
      "verse": 29,
      "title": "Solomon’s Wisdom"
    }
  ],
  "1kings:5": [
    {
      "verse": 1,
      "title": "Preparations for the Temple"
    },
    {
      "verse": 7,
      "title": "Hiram’s Reply to Solomon"
    },
    {
      "verse": 13,
      "title": "Solomon’s Labor Force"
    }
  ],
  "1kings:6": [
    {
      "verse": 1,
      "title": "Temple Construction Begins"
    },
    {
      "verse": 5,
      "title": "The Chambers"
    },
    {
      "verse": 11,
      "title": "God’s Promise to Solomon"
    },
    {
      "verse": 14,
      "title": "The Temple’s Interior"
    },
    {
      "verse": 23,
      "title": "The Cherubim"
    },
    {
      "verse": 31,
      "title": "The Doors"
    },
    {
      "verse": 36,
      "title": "The Courtyard"
    }
  ],
  "1kings:7": [
    {
      "verse": 1,
      "title": "Solomon’s Palace Complex"
    },
    {
      "verse": 13,
      "title": "The Pillars and Capitals"
    },
    {
      "verse": 23,
      "title": "The Molten Sea"
    },
    {
      "verse": 27,
      "title": "The Ten Bronze Stands"
    },
    {
      "verse": 38,
      "title": "The Ten Bronze Basins"
    },
    {
      "verse": 40,
      "title": "Completion of the Bronze Works"
    },
    {
      "verse": 48,
      "title": "Completion of the Gold Furnishings"
    }
  ],
  "1kings:8": [
    {
      "verse": 1,
      "title": "The Ark Enters the Temple"
    },
    {
      "verse": 12,
      "title": "Solomon Blesses the LORD"
    },
    {
      "verse": 22,
      "title": "Solomon’s Prayer of Dedication"
    },
    {
      "verse": 54,
      "title": "Solomon’s Benediction"
    },
    {
      "verse": 62,
      "title": "Sacrifices of Dedication"
    }
  ],
  "1kings:9": [
    {
      "verse": 1,
      "title": "The LORD’s Response to Solomon"
    },
    {
      "verse": 10,
      "title": "Solomon’s Additional Achievements"
    }
  ],
  "1kings:10": [
    {
      "verse": 1,
      "title": "The Queen of Sheba"
    },
    {
      "verse": 14,
      "title": "Solomon’s Wealth and Splendor"
    }
  ],
  "1kings:11": [
    {
      "verse": 1,
      "title": "Solomon’s Foreign Wives"
    },
    {
      "verse": 9,
      "title": "God’s Anger against Solomon"
    },
    {
      "verse": 14,
      "title": "Hadad’s Return"
    },
    {
      "verse": 23,
      "title": "Rezon’s Hostility"
    },
    {
      "verse": 26,
      "title": "Jeroboam’s Rebellion"
    },
    {
      "verse": 41,
      "title": "The Death of Solomon"
    }
  ],
  "1kings:12": [
    {
      "verse": 1,
      "title": "Rebellion against Rehoboam"
    },
    {
      "verse": 16,
      "title": "The Kingdom Divided"
    },
    {
      "verse": 20,
      "title": "Shemaiah’s Prophecy"
    },
    {
      "verse": 25,
      "title": "Jeroboam’s Idolatry"
    }
  ],
  "1kings:13": [
    {
      "verse": 1,
      "title": "Jeroboam’s Hand Withers"
    },
    {
      "verse": 11,
      "title": "The Old Prophet and the Man of God"
    }
  ],
  "1kings:14": [
    {
      "verse": 1,
      "title": "Ahijah’s Prophecy against Jeroboam"
    },
    {
      "verse": 19,
      "title": "Nadab Succeeds Jeroboam"
    },
    {
      "verse": 21,
      "title": "Rehoboam Reigns in Judah"
    },
    {
      "verse": 25,
      "title": "Shishak Raids Jerusalem"
    }
  ],
  "1kings:15": [
    {
      "verse": 1,
      "title": "Abijam Reigns in Judah"
    },
    {
      "verse": 9,
      "title": "Asa Reigns in Judah"
    },
    {
      "verse": 16,
      "title": "War between Asa and Baasha"
    },
    {
      "verse": 23,
      "title": "Jehoshaphat Succeeds Asa"
    },
    {
      "verse": 25,
      "title": "Nadab Reigns in Israel"
    },
    {
      "verse": 33,
      "title": "Baasha Reigns in Israel"
    }
  ],
  "1kings:16": [
    {
      "verse": 1,
      "title": "Jehu’s Prophecy against Baasha"
    },
    {
      "verse": 8,
      "title": "Elah Reigns in Israel"
    },
    {
      "verse": 15,
      "title": "Zimri Reigns in Israel"
    },
    {
      "verse": 21,
      "title": "Omri Reigns in Israel"
    },
    {
      "verse": 29,
      "title": "Ahab Reigns in Israel, Marries Jezebel"
    }
  ],
  "1kings:17": [
    {
      "verse": 1,
      "title": "The Ravens Feed Elijah"
    },
    {
      "verse": 8,
      "title": "The Widow of Zarephath"
    },
    {
      "verse": 17,
      "title": "Elijah Raises the Widow’s Son"
    }
  ],
  "1kings:18": [
    {
      "verse": 1,
      "title": "Elijah’s Message to Ahab"
    },
    {
      "verse": 16,
      "title": "Elijah on Mount Carmel"
    },
    {
      "verse": 36,
      "title": "Elijah’s Prayer"
    },
    {
      "verse": 41,
      "title": "The LORD Sends Rain"
    }
  ],
  "1kings:19": [
    {
      "verse": 1,
      "title": "Elijah Flees from Jezebel"
    },
    {
      "verse": 9,
      "title": "The LORD Speaks to Elijah at Horeb"
    },
    {
      "verse": 19,
      "title": "The Call of Elisha"
    }
  ],
  "1kings:20": [
    {
      "verse": 1,
      "title": "Ben-hadad Attacks Samaria"
    },
    {
      "verse": 13,
      "title": "Ahab Defeats Ben-hadad"
    },
    {
      "verse": 26,
      "title": "Another War with Ben-hadad"
    },
    {
      "verse": 31,
      "title": "Ahab Spares Ben-hadad"
    },
    {
      "verse": 35,
      "title": "A Prophet Reproves Ahab"
    }
  ],
  "1kings:21": [
    {
      "verse": 1,
      "title": "Naboth’s Vineyard"
    },
    {
      "verse": 8,
      "title": "Jezebel’s Plot"
    },
    {
      "verse": 17,
      "title": "Elijah Denounces Ahab and Jezebel"
    },
    {
      "verse": 25,
      "title": "Ahab’s Repentance"
    }
  ],
  "1kings:22": [
    {
      "verse": 1,
      "title": "Ahab and the False Prophets"
    },
    {
      "verse": 13,
      "title": "Micaiah Prophesies against Ahab"
    },
    {
      "verse": 29,
      "title": "Ahab’s Defeat and Death"
    },
    {
      "verse": 41,
      "title": "Jehoshaphat Reigns in Judah"
    },
    {
      "verse": 51,
      "title": "Ahaziah Reigns in Israel"
    }
  ],
  "2kings:1": [
    {
      "verse": 1,
      "title": "Elijah Denounces Ahaziah"
    },
    {
      "verse": 17,
      "title": "Jehoram Succeeds Ahaziah"
    }
  ],
  "2kings:2": [
    {
      "verse": 1,
      "title": "Elijah Taken Up to Heaven"
    },
    {
      "verse": 15,
      "title": "Elisha Succeeds Elijah"
    },
    {
      "verse": 19,
      "title": "Elisha Heals the Waters of Jericho"
    },
    {
      "verse": 23,
      "title": "Elisha Mocked"
    }
  ],
  "2kings:3": [
    {
      "verse": 1,
      "title": "Moab’s Rebellion"
    }
  ],
  "2kings:4": [
    {
      "verse": 1,
      "title": "The Widow’s Oil"
    },
    {
      "verse": 8,
      "title": "The Shunammite Woman"
    },
    {
      "verse": 18,
      "title": "Elisha Raises the Shunammite’s Son"
    },
    {
      "verse": 38,
      "title": "Elisha Purifies the Poisonous Stew"
    },
    {
      "verse": 42,
      "title": "Feeding a Hundred Men"
    }
  ],
  "2kings:5": [
    {
      "verse": 1,
      "title": "Naaman Cured of Leprosy"
    },
    {
      "verse": 15,
      "title": "Gehazi’s Greed and Leprosy"
    }
  ],
  "2kings:6": [
    {
      "verse": 1,
      "title": "The Axe Head Floats"
    },
    {
      "verse": 8,
      "title": "Elisha Captures the Blinded Arameans"
    },
    {
      "verse": 24,
      "title": "The Siege and Famine of Samaria"
    }
  ],
  "2kings:7": [
    {
      "verse": 1,
      "title": "Elisha’s Prophecy of Plenty"
    },
    {
      "verse": 3,
      "title": "The Arameans Flee"
    },
    {
      "verse": 16,
      "title": "Elisha’s Prophecy Fulfilled"
    }
  ],
  "2kings:8": [
    {
      "verse": 1,
      "title": "The Shunammite’s Land Restored"
    },
    {
      "verse": 7,
      "title": "Hazael Murders Ben-hadad"
    },
    {
      "verse": 16,
      "title": "Jehoram Reigns in Judah"
    },
    {
      "verse": 20,
      "title": "Edom and Libnah Rebel"
    },
    {
      "verse": 25,
      "title": "Ahaziah Reigns in Judah"
    }
  ],
  "2kings:9": [
    {
      "verse": 1,
      "title": "Jehu Anointed King of Israel"
    },
    {
      "verse": 14,
      "title": "Jehu Kills Joram and Ahaziah"
    },
    {
      "verse": 30,
      "title": "Jezebel’s Violent Death"
    }
  ],
  "2kings:10": [
    {
      "verse": 1,
      "title": "Ahab’s Seventy Sons Killed"
    },
    {
      "verse": 18,
      "title": "Jehu Kills the Priests of Baal"
    },
    {
      "verse": 28,
      "title": "Jehu Repeats Jeroboam’s Sins"
    },
    {
      "verse": 34,
      "title": "Jehoahaz Succeeds Jehu in Israel"
    }
  ],
  "2kings:11": [
    {
      "verse": 1,
      "title": "Athaliah and Joash"
    },
    {
      "verse": 4,
      "title": "Joash Anointed King of Judah"
    },
    {
      "verse": 13,
      "title": "The Death of Athaliah"
    },
    {
      "verse": 17,
      "title": "Jehoiada Restores the Worship of the LORD"
    }
  ],
  "2kings:12": [
    {
      "verse": 1,
      "title": "Joash Repairs the Temple"
    },
    {
      "verse": 17,
      "title": "The Death of Joash"
    }
  ],
  "2kings:13": [
    {
      "verse": 1,
      "title": "Jehoahaz Reigns in Israel"
    },
    {
      "verse": 10,
      "title": "Jehoash Reigns in Israel"
    },
    {
      "verse": 14,
      "title": "Elisha’s Final Prophecy"
    }
  ],
  "2kings:14": [
    {
      "verse": 1,
      "title": "Amaziah Reigns in Judah"
    },
    {
      "verse": 8,
      "title": "Jehoash Defeats Amaziah"
    },
    {
      "verse": 15,
      "title": "Jeroboam II Succeeds Jehoash in Israel"
    },
    {
      "verse": 17,
      "title": "The Death of Amaziah"
    },
    {
      "verse": 21,
      "title": "Azariah Succeeds Amaziah in Judah"
    },
    {
      "verse": 23,
      "title": "Jeroboam II Reigns in Israel"
    }
  ],
  "2kings:15": [
    {
      "verse": 1,
      "title": "Azariah Reigns in Judah"
    },
    {
      "verse": 8,
      "title": "Zechariah Reigns in Israel"
    },
    {
      "verse": 13,
      "title": "Shallum Reigns in Israel"
    },
    {
      "verse": 17,
      "title": "Menahem Reigns in Israel"
    },
    {
      "verse": 23,
      "title": "Pekahiah Reigns in Israel"
    },
    {
      "verse": 27,
      "title": "Pekah Reigns in Israel"
    },
    {
      "verse": 32,
      "title": "Jotham Reigns in Judah"
    }
  ],
  "2kings:16": [
    {
      "verse": 1,
      "title": "Ahaz Reigns in Judah"
    },
    {
      "verse": 10,
      "title": "The Idolatry of Ahaz"
    }
  ],
  "2kings:17": [
    {
      "verse": 1,
      "title": "Hoshea the Last King of Israel"
    },
    {
      "verse": 5,
      "title": "Israel Carried Captive to Assyria"
    },
    {
      "verse": 24,
      "title": "Samaria Resettled"
    }
  ],
  "2kings:18": [
    {
      "verse": 1,
      "title": "Hezekiah Destroys Idolatry in Judah"
    },
    {
      "verse": 13,
      "title": "Sennacherib Invades Judah"
    },
    {
      "verse": 17,
      "title": "Sennacherib Threatens Jerusalem"
    }
  ],
  "2kings:19": [
    {
      "verse": 1,
      "title": "Isaiah’s Message of Deliverance"
    },
    {
      "verse": 8,
      "title": "Sennacherib’s Blasphemous Letter"
    },
    {
      "verse": 14,
      "title": "Hezekiah’s Prayer"
    },
    {
      "verse": 20,
      "title": "Sennacherib’s Fall Prophesied"
    },
    {
      "verse": 35,
      "title": "Jerusalem Delivered from the Assyrians"
    }
  ],
  "2kings:20": [
    {
      "verse": 1,
      "title": "Hezekiah’s Illness and Recovery"
    },
    {
      "verse": 12,
      "title": "Hezekiah Shows His Treasures"
    },
    {
      "verse": 20,
      "title": "Manasseh Succeeds Hezekiah"
    }
  ],
  "2kings:21": [
    {
      "verse": 1,
      "title": "Manasseh Reigns in Judah"
    },
    {
      "verse": 10,
      "title": "Manasseh’s Idolatries Rebuked"
    },
    {
      "verse": 19,
      "title": "Amon Reigns in Judah"
    }
  ],
  "2kings:22": [
    {
      "verse": 1,
      "title": "Josiah Reigns in Judah"
    },
    {
      "verse": 3,
      "title": "Funding the Temple Repairs"
    },
    {
      "verse": 8,
      "title": "Hilkiah Finds the Book of the Law"
    },
    {
      "verse": 14,
      "title": "Huldah’s Prophecy"
    }
  ],
  "2kings:23": [
    {
      "verse": 1,
      "title": "Josiah Renews the Covenant"
    },
    {
      "verse": 4,
      "title": "Josiah Destroys Idolatry"
    },
    {
      "verse": 21,
      "title": "Josiah Restores the Passover"
    },
    {
      "verse": 28,
      "title": "The Death of Josiah"
    },
    {
      "verse": 31,
      "title": "Jehoahaz Succeeds Josiah"
    },
    {
      "verse": 36,
      "title": "Jehoiakim Reigns in Judah"
    }
  ],
  "2kings:24": [
    {
      "verse": 1,
      "title": "Babylon Controls Jehoiakim"
    },
    {
      "verse": 6,
      "title": "Jehoiachin Reigns in Judah"
    },
    {
      "verse": 10,
      "title": "The Captivity of Jerusalem"
    },
    {
      "verse": 18,
      "title": "Zedekiah Reigns in Judah"
    }
  ],
  "2kings:25": [
    {
      "verse": 1,
      "title": "Nebuchadnezzar Besieges Jerusalem"
    },
    {
      "verse": 8,
      "title": "The Temple Destroyed"
    },
    {
      "verse": 18,
      "title": "Captives Carried to Babylon"
    },
    {
      "verse": 22,
      "title": "Gedaliah Governs in Judah"
    },
    {
      "verse": 25,
      "title": "The Murder of Gedaliah"
    },
    {
      "verse": 27,
      "title": "Jehoiachin Released from Prison"
    }
  ],
  "1chronicles:1": [
    {
      "verse": 1,
      "title": "From Adam to Abraham"
    },
    {
      "verse": 28,
      "title": "The Descendants of Abraham"
    },
    {
      "verse": 35,
      "title": "The Descendants of Esau"
    },
    {
      "verse": 38,
      "title": "The Descendants of Seir"
    },
    {
      "verse": 43,
      "title": "The Kings of Edom"
    }
  ],
  "1chronicles:2": [
    {
      "verse": 1,
      "title": "The Sons of Israel"
    }
  ],
  "1chronicles:3": [
    {
      "verse": 1,
      "title": "The Descendants of David"
    },
    {
      "verse": 10,
      "title": "The Descendants of Solomon"
    },
    {
      "verse": 17,
      "title": "The Royal Line After the Exile"
    }
  ],
  "1chronicles:4": [
    {
      "verse": 1,
      "title": "The Descendants of Judah"
    },
    {
      "verse": 9,
      "title": "The Prayer of Jabez"
    },
    {
      "verse": 11,
      "title": "More Descendants of Judah"
    },
    {
      "verse": 24,
      "title": "The Descendants of Simeon"
    }
  ],
  "1chronicles:5": [
    {
      "verse": 1,
      "title": "The Descendants of Reuben"
    },
    {
      "verse": 11,
      "title": "The Descendants of Gad"
    },
    {
      "verse": 23,
      "title": "The Half-Tribe of Manasseh"
    }
  ],
  "1chronicles:6": [
    {
      "verse": 1,
      "title": "The Descendants of Levi"
    },
    {
      "verse": 31,
      "title": "The Temple Musicians"
    },
    {
      "verse": 48,
      "title": "The Descendants of Aaron"
    },
    {
      "verse": 54,
      "title": "Territories for the Levites"
    }
  ],
  "1chronicles:7": [
    {
      "verse": 1,
      "title": "The Descendants of Issachar"
    },
    {
      "verse": 6,
      "title": "The Descendants of Benjamin"
    },
    {
      "verse": 13,
      "title": "The Descendants of Naphtali"
    },
    {
      "verse": 14,
      "title": "The Descendants of Manasseh"
    },
    {
      "verse": 20,
      "title": "The Descendants of Ephraim"
    },
    {
      "verse": 30,
      "title": "The Descendants of Asher"
    }
  ],
  "1chronicles:8": [
    {
      "verse": 1,
      "title": "Genealogy from Benjamin to Saul"
    },
    {
      "verse": 33,
      "title": "The Family of Saul"
    }
  ],
  "1chronicles:9": [
    {
      "verse": 1,
      "title": "The People of Jerusalem"
    },
    {
      "verse": 35,
      "title": "The Descendants of Saul"
    }
  ],
  "1chronicles:10": [
    {
      "verse": 1,
      "title": "Saul’s Overthrow and Death"
    },
    {
      "verse": 7,
      "title": "The Philistines Possess the Towns"
    },
    {
      "verse": 11,
      "title": "Jabesh-gilead’s Tribute to Saul"
    }
  ],
  "1chronicles:11": [
    {
      "verse": 1,
      "title": "David Anointed King of All Israel"
    },
    {
      "verse": 4,
      "title": "David Conquers Jerusalem"
    },
    {
      "verse": 10,
      "title": "David’s Mighty Men"
    }
  ],
  "1chronicles:12": [
    {
      "verse": 1,
      "title": "The Mighty Men Join David at Ziklag"
    },
    {
      "verse": 23,
      "title": "David’s Army Grows at Hebron"
    }
  ],
  "1chronicles:13": [
    {
      "verse": 1,
      "title": "David Fetches the Ark"
    },
    {
      "verse": 8,
      "title": "Uzzah Touches the Ark"
    }
  ],
  "1chronicles:14": [
    {
      "verse": 1,
      "title": "David’s Family Grows"
    },
    {
      "verse": 8,
      "title": "Two Victories over the Philistines"
    }
  ],
  "1chronicles:15": [
    {
      "verse": 1,
      "title": "Preparing to Move the Ark"
    },
    {
      "verse": 14,
      "title": "The Priests and Levites Carry the Ark"
    },
    {
      "verse": 25,
      "title": "Moving the Ark to Jerusalem"
    },
    {
      "verse": 29,
      "title": "Michal’s Contempt for David"
    }
  ],
  "1chronicles:16": [
    {
      "verse": 1,
      "title": "A Tent for the Ark"
    },
    {
      "verse": 7,
      "title": "David’s Psalm of Thanksgiving"
    },
    {
      "verse": 23,
      "title": "Sing to the LORD, All the Earth"
    },
    {
      "verse": 37,
      "title": "Worship before the Ark"
    }
  ],
  "1chronicles:17": [
    {
      "verse": 1,
      "title": "God’s Covenant with David"
    },
    {
      "verse": 16,
      "title": "David’s Prayer of Thanksgiving"
    }
  ],
  "1chronicles:18": [
    {
      "verse": 1,
      "title": "David’s Triumphs"
    },
    {
      "verse": 14,
      "title": "David’s Officers"
    }
  ],
  "1chronicles:19": [
    {
      "verse": 1,
      "title": "David’s Messengers Disgraced"
    },
    {
      "verse": 10,
      "title": "David Defeats Ammon and Aram"
    }
  ],
  "1chronicles:20": [
    {
      "verse": 1,
      "title": "The Capture of Rabbah"
    },
    {
      "verse": 4,
      "title": "Battles against the Philistines"
    }
  ],
  "1chronicles:21": [
    {
      "verse": 1,
      "title": "David’s Military Census"
    },
    {
      "verse": 7,
      "title": "Judgment for David’s Sin"
    },
    {
      "verse": 14,
      "title": "A Plague on Israel"
    },
    {
      "verse": 18,
      "title": "David Builds an Altar"
    }
  ],
  "1chronicles:22": [
    {
      "verse": 1,
      "title": "Preparations for the Temple"
    },
    {
      "verse": 6,
      "title": "Solomon Anointed to Build the Temple"
    }
  ],
  "1chronicles:23": [
    {
      "verse": 1,
      "title": "The Divisions of the Levites"
    },
    {
      "verse": 7,
      "title": "The Gershonites"
    },
    {
      "verse": 12,
      "title": "The Kohathites"
    },
    {
      "verse": 21,
      "title": "The Merarites"
    },
    {
      "verse": 24,
      "title": "Levite Duties Revised"
    }
  ],
  "1chronicles:24": [
    {
      "verse": 1,
      "title": "Twenty-Four Divisions of Priests"
    },
    {
      "verse": 20,
      "title": "The Rest of the Levites"
    }
  ],
  "1chronicles:25": [
    {
      "verse": 1,
      "title": "Twenty-Four Divisions of Musicians"
    }
  ],
  "1chronicles:26": [
    {
      "verse": 1,
      "title": "The Divisions of the Gatekeepers"
    },
    {
      "verse": 20,
      "title": "The Treasurers, Officers, and Judges"
    }
  ],
  "1chronicles:27": [
    {
      "verse": 1,
      "title": "Twelve Captains for Twelve Months"
    },
    {
      "verse": 16,
      "title": "The Leaders of the Twelve Tribes"
    },
    {
      "verse": 25,
      "title": "David’s Various Overseers"
    },
    {
      "verse": 32,
      "title": "The Counselors"
    }
  ],
  "1chronicles:28": [
    {
      "verse": 1,
      "title": "David Commissions Solomon"
    },
    {
      "verse": 11,
      "title": "The Plans for the Temple"
    }
  ],
  "1chronicles:29": [
    {
      "verse": 1,
      "title": "Offerings for the Temple"
    },
    {
      "verse": 10,
      "title": "David’s Prayer of Blessing"
    },
    {
      "verse": 21,
      "title": "Solomon Anointed King"
    },
    {
      "verse": 26,
      "title": "David’s Reign and Death"
    }
  ],
  "2chronicles:1": [
    {
      "verse": 1,
      "title": "Solomon’s Prayer for Wisdom"
    },
    {
      "verse": 14,
      "title": "Solomon’s Riches"
    }
  ],
  "2chronicles:2": [
    {
      "verse": 1,
      "title": "Preparations for the Temple"
    },
    {
      "verse": 11,
      "title": "Hiram’s Reply to Solomon"
    }
  ],
  "2chronicles:3": [
    {
      "verse": 1,
      "title": "Temple Construction Begins"
    },
    {
      "verse": 5,
      "title": "The Temple’s Interior"
    },
    {
      "verse": 10,
      "title": "The Cherubim"
    },
    {
      "verse": 14,
      "title": "The Veil and Pillars"
    }
  ],
  "2chronicles:4": [
    {
      "verse": 1,
      "title": "The Bronze Altar and Molten Sea"
    },
    {
      "verse": 6,
      "title": "The Ten Basins, Lampstands, and Tables"
    },
    {
      "verse": 9,
      "title": "The Courts"
    },
    {
      "verse": 11,
      "title": "Completion of the Bronze Works"
    },
    {
      "verse": 19,
      "title": "Completion of the Gold Furnishings"
    }
  ],
  "2chronicles:5": [
    {
      "verse": 1,
      "title": "The Ark Enters the Temple"
    }
  ],
  "2chronicles:6": [
    {
      "verse": 1,
      "title": "Solomon Blesses the LORD"
    },
    {
      "verse": 12,
      "title": "Solomon’s Prayer of Dedication"
    }
  ],
  "2chronicles:7": [
    {
      "verse": 1,
      "title": "Fire from Heaven"
    },
    {
      "verse": 4,
      "title": "Sacrifices of Dedication"
    },
    {
      "verse": 11,
      "title": "The LORD’s Response to Solomon"
    }
  ],
  "2chronicles:8": [
    {
      "verse": 1,
      "title": "Solomon’s Additional Achievements"
    }
  ],
  "2chronicles:9": [
    {
      "verse": 1,
      "title": "The Queen of Sheba"
    },
    {
      "verse": 13,
      "title": "Solomon’s Wealth and Splendor"
    },
    {
      "verse": 29,
      "title": "The Death of Solomon"
    }
  ],
  "2chronicles:10": [
    {
      "verse": 1,
      "title": "Rebellion against Rehoboam"
    },
    {
      "verse": 16,
      "title": "The Kingdom Divided"
    }
  ],
  "2chronicles:11": [
    {
      "verse": 1,
      "title": "Shemaiah’s Prophecy"
    },
    {
      "verse": 5,
      "title": "Rehoboam Fortifies Judah"
    },
    {
      "verse": 13,
      "title": "Jeroboam Forsakes the Priests and Levites"
    },
    {
      "verse": 18,
      "title": "Rehoboam’s Family"
    }
  ],
  "2chronicles:12": [
    {
      "verse": 1,
      "title": "Shishak Raids Jerusalem"
    },
    {
      "verse": 13,
      "title": "Rehoboam’s Reign and Death"
    }
  ],
  "2chronicles:13": [
    {
      "verse": 1,
      "title": "Abijah Reigns in Judah"
    },
    {
      "verse": 4,
      "title": "Civil War against Jeroboam"
    }
  ],
  "2chronicles:14": [
    {
      "verse": 1,
      "title": "Asa Reigns in Judah"
    }
  ],
  "2chronicles:15": [
    {
      "verse": 1,
      "title": "The Prophecy of Azariah"
    },
    {
      "verse": 8,
      "title": "Asa’s Reforms"
    }
  ],
  "2chronicles:16": [
    {
      "verse": 1,
      "title": "War between Asa and Baasha"
    },
    {
      "verse": 7,
      "title": "Hanani’s Message to Asa"
    },
    {
      "verse": 11,
      "title": "The Death and Burial of Asa"
    }
  ],
  "2chronicles:17": [
    {
      "verse": 1,
      "title": "Jehoshaphat Reigns in Judah"
    }
  ],
  "2chronicles:18": [
    {
      "verse": 1,
      "title": "Jehoshaphat Allies with Ahab"
    },
    {
      "verse": 12,
      "title": "Micaiah Prophesies against Ahab"
    },
    {
      "verse": 28,
      "title": "Ahab’s Defeat and Death"
    }
  ],
  "2chronicles:19": [
    {
      "verse": 1,
      "title": "Jehoshaphat Reproved by Jehu"
    },
    {
      "verse": 4,
      "title": "Jehoshaphat’s Reforms"
    }
  ],
  "2chronicles:20": [
    {
      "verse": 1,
      "title": "War against Jehoshaphat"
    },
    {
      "verse": 5,
      "title": "Jehoshaphat’s Prayer"
    },
    {
      "verse": 14,
      "title": "The Prophecy of Jahaziel"
    },
    {
      "verse": 20,
      "title": "The Enemies Destroy Themselves"
    },
    {
      "verse": 26,
      "title": "The Joyful Return"
    },
    {
      "verse": 31,
      "title": "Summary of Jehoshaphat’s Reign"
    },
    {
      "verse": 35,
      "title": "Jehoshaphat’s Fleet Is Wrecked"
    }
  ],
  "2chronicles:21": [
    {
      "verse": 1,
      "title": "Jehoram Reigns in Judah"
    },
    {
      "verse": 8,
      "title": "Edom and Libnah Rebel"
    },
    {
      "verse": 12,
      "title": "Elijah’s Letter to Jehoram"
    },
    {
      "verse": 16,
      "title": "Jehoram’s Disease and Death"
    }
  ],
  "2chronicles:22": [
    {
      "verse": 1,
      "title": "Ahaziah Reigns in Judah"
    },
    {
      "verse": 8,
      "title": "Jehu Kills the Princes of Judah"
    },
    {
      "verse": 10,
      "title": "Athaliah and Joash"
    }
  ],
  "2chronicles:23": [
    {
      "verse": 1,
      "title": "Joash Anointed King of Judah"
    },
    {
      "verse": 12,
      "title": "The Death of Athaliah"
    },
    {
      "verse": 16,
      "title": "Jehoiada Restores the Worship of the LORD"
    }
  ],
  "2chronicles:24": [
    {
      "verse": 1,
      "title": "Joash Repairs the Temple"
    },
    {
      "verse": 15,
      "title": "Jehoiada’s Death and Burial"
    },
    {
      "verse": 17,
      "title": "The Wickedness of Joash"
    },
    {
      "verse": 23,
      "title": "The Death of Joash"
    }
  ],
  "2chronicles:25": [
    {
      "verse": 1,
      "title": "Amaziah Reigns in Judah"
    },
    {
      "verse": 5,
      "title": "Amaziah’s Victories"
    },
    {
      "verse": 14,
      "title": "Amaziah Rebuked for Idolatry"
    },
    {
      "verse": 17,
      "title": "Jehoash Defeats Amaziah"
    },
    {
      "verse": 25,
      "title": "The Death of Amaziah"
    }
  ],
  "2chronicles:26": [
    {
      "verse": 1,
      "title": "Uzziah Reigns in Judah"
    }
  ],
  "2chronicles:27": [
    {
      "verse": 1,
      "title": "Jotham Reigns in Judah"
    }
  ],
  "2chronicles:28": [
    {
      "verse": 1,
      "title": "Ahaz Reigns in Judah"
    },
    {
      "verse": 5,
      "title": "Aram Defeats Judah"
    },
    {
      "verse": 16,
      "title": "The Idolatry of Ahaz"
    }
  ],
  "2chronicles:29": [
    {
      "verse": 1,
      "title": "Hezekiah Cleanses the Temple"
    },
    {
      "verse": 20,
      "title": "Hezekiah Restores Temple Worship"
    }
  ],
  "2chronicles:30": [
    {
      "verse": 1,
      "title": "Hezekiah Proclaims a Passover"
    },
    {
      "verse": 13,
      "title": "Hezekiah Celebrates the Passover"
    }
  ],
  "2chronicles:31": [
    {
      "verse": 1,
      "title": "The Destruction of Idols"
    },
    {
      "verse": 3,
      "title": "Contributions for Worship"
    },
    {
      "verse": 11,
      "title": "Hezekiah Organizes the Priests"
    }
  ],
  "2chronicles:32": [
    {
      "verse": 1,
      "title": "Sennacherib Invades Judah"
    },
    {
      "verse": 9,
      "title": "Sennacherib Threatens Jerusalem"
    },
    {
      "verse": 20,
      "title": "Jerusalem Delivered from the Assyrians"
    },
    {
      "verse": 24,
      "title": "Hezekiah’s Illness and Recovery"
    },
    {
      "verse": 32,
      "title": "Hezekiah’s Death"
    }
  ],
  "2chronicles:33": [
    {
      "verse": 1,
      "title": "Manasseh Reigns in Judah"
    },
    {
      "verse": 10,
      "title": "Manasseh’s Repentance and Restoration"
    },
    {
      "verse": 21,
      "title": "Amon Reigns in Judah"
    }
  ],
  "2chronicles:34": [
    {
      "verse": 1,
      "title": "Josiah Reigns in Judah"
    },
    {
      "verse": 3,
      "title": "Josiah Destroys Idolatry"
    },
    {
      "verse": 8,
      "title": "Josiah Repairs the Temple"
    },
    {
      "verse": 14,
      "title": "Hilkiah Finds the Book of the Law"
    },
    {
      "verse": 22,
      "title": "Huldah’s Prophecy"
    },
    {
      "verse": 29,
      "title": "Josiah Renews the Covenant"
    }
  ],
  "2chronicles:35": [
    {
      "verse": 1,
      "title": "Josiah Restores the Passover"
    },
    {
      "verse": 20,
      "title": "The Death of Josiah"
    },
    {
      "verse": 25,
      "title": "Laments over Josiah"
    }
  ],
  "2chronicles:36": [
    {
      "verse": 1,
      "title": "Jehoahaz Succeeds Josiah"
    },
    {
      "verse": 5,
      "title": "Jehoiakim Reigns in Judah"
    },
    {
      "verse": 9,
      "title": "Jehoiachin Reigns in Judah"
    },
    {
      "verse": 11,
      "title": "Zedekiah Reigns in Judah"
    },
    {
      "verse": 15,
      "title": "The Fall of Jerusalem"
    },
    {
      "verse": 22,
      "title": "The Proclamation of Cyrus"
    }
  ],
  "ezra:1": [
    {
      "verse": 1,
      "title": "The Proclamation of Cyrus"
    },
    {
      "verse": 7,
      "title": "Cyrus Restores the Holy Vessels"
    }
  ],
  "ezra:2": [
    {
      "verse": 1,
      "title": "The List of Returning Exiles"
    },
    {
      "verse": 68,
      "title": "Offerings by the Exiles"
    }
  ],
  "ezra:3": [
    {
      "verse": 1,
      "title": "Sacrifices Restored"
    },
    {
      "verse": 8,
      "title": "Temple Restoration Begins"
    }
  ],
  "ezra:4": [
    {
      "verse": 1,
      "title": "Adversaries Hinder the Work"
    },
    {
      "verse": 6,
      "title": "Opposition under Xerxes and Artaxerxes"
    },
    {
      "verse": 17,
      "title": "The Decree of Artaxerxes"
    }
  ],
  "ezra:5": [
    {
      "verse": 1,
      "title": "Temple Rebuilding Resumes"
    },
    {
      "verse": 6,
      "title": "Tattenai’s Letter to Darius"
    }
  ],
  "ezra:6": [
    {
      "verse": 1,
      "title": "The Decree of Darius"
    },
    {
      "verse": 13,
      "title": "The Temple Completed"
    },
    {
      "verse": 16,
      "title": "Dedication of the Temple"
    },
    {
      "verse": 19,
      "title": "The Returned Exiles Keep the Passover"
    }
  ],
  "ezra:7": [
    {
      "verse": 1,
      "title": "Ezra Arrives in Jerusalem"
    },
    {
      "verse": 11,
      "title": "Artaxerxes’ Letter for Ezra"
    },
    {
      "verse": 27,
      "title": "Ezra Blesses God"
    }
  ],
  "ezra:8": [
    {
      "verse": 1,
      "title": "The Exiles Who Returned with Ezra"
    },
    {
      "verse": 15,
      "title": "Ezra Sends for the Levites"
    },
    {
      "verse": 21,
      "title": "Fasting for Protection"
    },
    {
      "verse": 24,
      "title": "Priests to Guard the Offerings"
    },
    {
      "verse": 32,
      "title": "Arrival in Jerusalem"
    }
  ],
  "ezra:9": [
    {
      "verse": 1,
      "title": "Intermarriage with Neighboring Peoples"
    },
    {
      "verse": 5,
      "title": "Ezra’s Prayer of Confession"
    }
  ],
  "ezra:10": [
    {
      "verse": 1,
      "title": "Shecaniah’s Encouragement"
    },
    {
      "verse": 6,
      "title": "The People’s Confession of Sin"
    },
    {
      "verse": 18,
      "title": "Those Guilty of Intermarriage"
    }
  ],
  "nehemiah:1": [
    {
      "verse": 1,
      "title": "Nehemiah’s Prayer"
    }
  ],
  "nehemiah:2": [
    {
      "verse": 1,
      "title": "Nehemiah Sent to Jerusalem"
    },
    {
      "verse": 11,
      "title": "Nehemiah Inspects the Walls"
    }
  ],
  "nehemiah:3": [
    {
      "verse": 1,
      "title": "The Builders of the Walls"
    }
  ],
  "nehemiah:4": [
    {
      "verse": 1,
      "title": "The Work Ridiculed"
    },
    {
      "verse": 9,
      "title": "Discouragement Overcome"
    }
  ],
  "nehemiah:5": [
    {
      "verse": 1,
      "title": "Nehemiah Defends the Oppressed"
    },
    {
      "verse": 14,
      "title": "Nehemiah’s Generosity"
    }
  ],
  "nehemiah:6": [
    {
      "verse": 1,
      "title": "Sanballat’s Conspiracy"
    },
    {
      "verse": 15,
      "title": "Completion of the Wall"
    }
  ],
  "nehemiah:7": [
    {
      "verse": 1,
      "title": "Securing the City"
    },
    {
      "verse": 4,
      "title": "The List of Returning Exiles"
    },
    {
      "verse": 70,
      "title": "Offerings by the Exiles"
    }
  ],
  "nehemiah:8": [
    {
      "verse": 1,
      "title": "Ezra Reads the Law"
    },
    {
      "verse": 13,
      "title": "The Feast of Tabernacles"
    }
  ],
  "nehemiah:9": [
    {
      "verse": 1,
      "title": "The People Confess Their Sins"
    }
  ],
  "nehemiah:10": [
    {
      "verse": 1,
      "title": "Signers of the Covenant"
    },
    {
      "verse": 28,
      "title": "The Vows of the Covenant"
    }
  ],
  "nehemiah:11": [
    {
      "verse": 1,
      "title": "Jerusalem’s New Settlers"
    },
    {
      "verse": 20,
      "title": "Residents Outside Jerusalem"
    }
  ],
  "nehemiah:12": [
    {
      "verse": 1,
      "title": "The Priests and Levites Who Returned"
    },
    {
      "verse": 27,
      "title": "The Dedication of the Wall"
    },
    {
      "verse": 44,
      "title": "Provisions for Temple Worship"
    }
  ],
  "nehemiah:13": [
    {
      "verse": 1,
      "title": "Foreigners Excluded"
    },
    {
      "verse": 4,
      "title": "The Temple Cleansed"
    },
    {
      "verse": 10,
      "title": "Tithes Restored"
    },
    {
      "verse": 15,
      "title": "The Sabbath Restored"
    },
    {
      "verse": 23,
      "title": "Intermarriage Forbidden"
    }
  ],
  "esther:1": [
    {
      "verse": 1,
      "title": "Xerxes’ Royal Feast"
    },
    {
      "verse": 9,
      "title": "Queen Vashti’s Refusal"
    },
    {
      "verse": 13,
      "title": "Queen Vashti Deposed"
    }
  ],
  "esther:2": [
    {
      "verse": 1,
      "title": "Seeking Vashti’s Successor"
    },
    {
      "verse": 5,
      "title": "Esther Finds Favor"
    },
    {
      "verse": 17,
      "title": "Esther Becomes Queen"
    },
    {
      "verse": 21,
      "title": "Mordecai Uncovers a Conspiracy"
    }
  ],
  "esther:3": [
    {
      "verse": 1,
      "title": "Haman’s Plot against the Jews"
    }
  ],
  "esther:4": [
    {
      "verse": 1,
      "title": "Mordecai Appeals to Esther"
    }
  ],
  "esther:5": [
    {
      "verse": 1,
      "title": "Esther Approaches the King"
    },
    {
      "verse": 9,
      "title": "Haman’s Plot against Mordecai"
    }
  ],
  "esther:6": [
    {
      "verse": 1,
      "title": "Mordecai Is Honored"
    }
  ],
  "esther:7": [
    {
      "verse": 1,
      "title": "Esther Pleads for Her People"
    },
    {
      "verse": 7,
      "title": "The Hanging of Haman"
    }
  ],
  "esther:8": [
    {
      "verse": 1,
      "title": "Esther Appeals for the Jews"
    },
    {
      "verse": 7,
      "title": "The Decree of Xerxes"
    }
  ],
  "esther:9": [
    {
      "verse": 1,
      "title": "The Jews Destroy Their Enemies"
    },
    {
      "verse": 11,
      "title": "Haman’s Sons Hanged"
    },
    {
      "verse": 18,
      "title": "The Feast of Purim Instituted"
    }
  ],
  "esther:10": [
    {
      "verse": 1,
      "title": "Tribute to Xerxes and Mordecai"
    }
  ],
  "job:1": [
    {
      "verse": 1,
      "title": "Job’s Character and Wealth"
    },
    {
      "verse": 6,
      "title": "Satan’s First Attack"
    },
    {
      "verse": 13,
      "title": "Job Loses His Children and Possessions"
    }
  ],
  "job:2": [
    {
      "verse": 1,
      "title": "Job Loses His Health"
    },
    {
      "verse": 11,
      "title": "Job’s Three Friends"
    }
  ],
  "job:3": [
    {
      "verse": 1,
      "title": "Job Laments His Birth"
    }
  ],
  "job:4": [
    {
      "verse": 1,
      "title": "Eliphaz: The Innocent Prosper"
    }
  ],
  "job:5": [
    {
      "verse": 1,
      "title": "Eliphaz Continues: God Blesses those Who Seek Him"
    }
  ],
  "job:6": [
    {
      "verse": 1,
      "title": "Job Replies: My Complaint Is Just"
    }
  ],
  "job:7": [
    {
      "verse": 1,
      "title": "Job Continues: Life Seems Futile"
    }
  ],
  "job:8": [
    {
      "verse": 1,
      "title": "Bildad: Job Should Repent"
    }
  ],
  "job:9": [
    {
      "verse": 1,
      "title": "Job: How Can I Contend with God?"
    }
  ],
  "job:10": [
    {
      "verse": 1,
      "title": "Job’s Plea to God"
    }
  ],
  "job:11": [
    {
      "verse": 1,
      "title": "Zophar Rebukes Job"
    }
  ],
  "job:12": [
    {
      "verse": 1,
      "title": "Job Presents His Case"
    }
  ],
  "job:13": [
    {
      "verse": 1,
      "title": "Job Prepares His Case"
    }
  ],
  "job:14": [
    {
      "verse": 1,
      "title": "Job Laments the Finality of Death"
    }
  ],
  "job:15": [
    {
      "verse": 1,
      "title": "Eliphaz: Job Does Not Fear God"
    }
  ],
  "job:16": [
    {
      "verse": 1,
      "title": "Job Decries His Comforters"
    }
  ],
  "job:17": [
    {
      "verse": 1,
      "title": "Job Prepares for Death"
    }
  ],
  "job:18": [
    {
      "verse": 1,
      "title": "Bildad: God Punishes the Wicked"
    }
  ],
  "job:19": [
    {
      "verse": 1,
      "title": "Job: My Redeemer Lives"
    }
  ],
  "job:20": [
    {
      "verse": 1,
      "title": "Zophar: Destruction Awaits the Wicked"
    }
  ],
  "job:21": [
    {
      "verse": 1,
      "title": "Job: God Will Punish the Wicked"
    }
  ],
  "job:22": [
    {
      "verse": 1,
      "title": "Eliphaz: Can a Man Be of Use to God?"
    }
  ],
  "job:23": [
    {
      "verse": 1,
      "title": "Job Longs for God"
    }
  ],
  "job:24": [
    {
      "verse": 1,
      "title": "Job: Judgment for the Wicked"
    }
  ],
  "job:25": [
    {
      "verse": 1,
      "title": "Bildad: Man Cannot Be Righteous"
    }
  ],
  "job:26": [
    {
      "verse": 1,
      "title": "Job: Who Can Understand God’s Majesty?"
    }
  ],
  "job:27": [
    {
      "verse": 1,
      "title": "Job Affirms His Integrity"
    },
    {
      "verse": 7,
      "title": "The Wicked Man’s Portion"
    }
  ],
  "job:28": [
    {
      "verse": 1,
      "title": "Where Can Wisdom Be Found?"
    }
  ],
  "job:29": [
    {
      "verse": 1,
      "title": "Job’s Former Blessings"
    }
  ],
  "job:30": [
    {
      "verse": 1,
      "title": "Job’s Honor Turned to Contempt"
    },
    {
      "verse": 15,
      "title": "Job’s Prosperity Becomes Calamity"
    }
  ],
  "job:31": [
    {
      "verse": 1,
      "title": "Job’s Final Appeal"
    }
  ],
  "job:32": [
    {
      "verse": 1,
      "title": "Elihu Rebukes Job’s Friends"
    }
  ],
  "job:33": [
    {
      "verse": 1,
      "title": "Elihu Rebukes Job"
    }
  ],
  "job:34": [
    {
      "verse": 1,
      "title": "Elihu Confirms God’s Justice"
    }
  ],
  "job:35": [
    {
      "verse": 1,
      "title": "Elihu Recalls God’s Justice"
    }
  ],
  "job:36": [
    {
      "verse": 1,
      "title": "Elihu Describes God’s Power"
    }
  ],
  "job:37": [
    {
      "verse": 1,
      "title": "Elihu Proclaims God’s Majesty"
    }
  ],
  "job:38": [
    {
      "verse": 1,
      "title": "The LORD Challenges Job"
    }
  ],
  "job:39": [
    {
      "verse": 1,
      "title": "The LORD Speaks of His Creation"
    }
  ],
  "job:40": [
    {
      "verse": 1,
      "title": "Job Humbles Himself before the LORD"
    },
    {
      "verse": 6,
      "title": "The LORD Challenges Job Again"
    }
  ],
  "job:41": [
    {
      "verse": 1,
      "title": "The LORD’s Power Shown in Leviathan"
    }
  ],
  "job:42": [
    {
      "verse": 1,
      "title": "Job Submits Himself to the LORD"
    },
    {
      "verse": 7,
      "title": "The LORD Rebukes Job’s Friends"
    },
    {
      "verse": 10,
      "title": "The LORD Blesses Job"
    }
  ],
  "psalms:1": [
    {
      "verse": 1,
      "title": "The Two Paths"
    }
  ],
  "psalms:2": [
    {
      "verse": 1,
      "title": "The Triumphant Messiah"
    }
  ],
  "psalms:3": [
    {
      "verse": 1,
      "title": "Deliver Me, O LORD!"
    }
  ],
  "psalms:4": [
    {
      "verse": 1,
      "title": "Answer Me When I Call!"
    }
  ],
  "psalms:5": [
    {
      "verse": 1,
      "title": "Give Ear to My Words"
    }
  ],
  "psalms:6": [
    {
      "verse": 1,
      "title": "Do Not Rebuke Me in Your Anger"
    }
  ],
  "psalms:7": [
    {
      "verse": 1,
      "title": "I Take Refuge in You"
    }
  ],
  "psalms:8": [
    {
      "verse": 1,
      "title": "How Majestic Is Your Name!"
    }
  ],
  "psalms:9": [
    {
      "verse": 1,
      "title": "I Will Give Thanks to the LORD"
    }
  ],
  "psalms:10": [
    {
      "verse": 1,
      "title": "The Perils of the Pilgrim"
    }
  ],
  "psalms:11": [
    {
      "verse": 1,
      "title": "In the LORD I Take Refuge"
    }
  ],
  "psalms:12": [
    {
      "verse": 1,
      "title": "The Godly Are No More"
    }
  ],
  "psalms:13": [
    {
      "verse": 1,
      "title": "How Long, O LORD?"
    }
  ],
  "psalms:14": [
    {
      "verse": 1,
      "title": "The Fool Says There Is No God"
    }
  ],
  "psalms:15": [
    {
      "verse": 1,
      "title": "Who May Dwell on Your Holy Mountain?"
    }
  ],
  "psalms:16": [
    {
      "verse": 1,
      "title": "The Presence of the LORD"
    }
  ],
  "psalms:17": [
    {
      "verse": 1,
      "title": "Hear My Righteous Plea"
    }
  ],
  "psalms:18": [
    {
      "verse": 1,
      "title": "The LORD Is My Rock"
    }
  ],
  "psalms:19": [
    {
      "verse": 1,
      "title": "The Heavens Declare the Glory of God"
    }
  ],
  "psalms:20": [
    {
      "verse": 1,
      "title": "The Day of Trouble"
    }
  ],
  "psalms:21": [
    {
      "verse": 1,
      "title": "After the Battle"
    }
  ],
  "psalms:22": [
    {
      "verse": 1,
      "title": "The Psalm of the Cross"
    }
  ],
  "psalms:23": [
    {
      "verse": 1,
      "title": "The LORD Is My Shepherd"
    }
  ],
  "psalms:24": [
    {
      "verse": 1,
      "title": "The Earth Is the LORD’s"
    }
  ],
  "psalms:25": [
    {
      "verse": 1,
      "title": "To You I Lift Up My Soul"
    }
  ],
  "psalms:26": [
    {
      "verse": 1,
      "title": "Vindicate Me, O LORD"
    }
  ],
  "psalms:27": [
    {
      "verse": 1,
      "title": "The LORD Is My Salvation"
    }
  ],
  "psalms:28": [
    {
      "verse": 1,
      "title": "The LORD Is My Strength"
    }
  ],
  "psalms:29": [
    {
      "verse": 1,
      "title": "Ascribe Glory to the LORD"
    }
  ],
  "psalms:30": [
    {
      "verse": 1,
      "title": "You Turned My Mourning into Dancing"
    }
  ],
  "psalms:31": [
    {
      "verse": 1,
      "title": "Into Your Hands I Commit My Spirit"
    }
  ],
  "psalms:32": [
    {
      "verse": 1,
      "title": "The Joy of Forgiveness"
    }
  ],
  "psalms:33": [
    {
      "verse": 1,
      "title": "Praise to the Creator"
    }
  ],
  "psalms:34": [
    {
      "verse": 1,
      "title": "Taste and See That the LORD Is Good"
    }
  ],
  "psalms:35": [
    {
      "verse": 1,
      "title": "Contend with My Opponents, O LORD"
    }
  ],
  "psalms:36": [
    {
      "verse": 1,
      "title": "The Transgression of the Wicked"
    }
  ],
  "psalms:37": [
    {
      "verse": 1,
      "title": "Delight Yourself in the LORD"
    }
  ],
  "psalms:38": [
    {
      "verse": 1,
      "title": "Do Not Rebuke Me in Your Anger"
    }
  ],
  "psalms:39": [
    {
      "verse": 1,
      "title": "I Will Watch My Ways"
    }
  ],
  "psalms:40": [
    {
      "verse": 1,
      "title": "I Waited Patiently for the LORD"
    }
  ],
  "psalms:41": [
    {
      "verse": 1,
      "title": "Victory over Betrayal"
    }
  ],
  "psalms:42": [
    {
      "verse": 1,
      "title": "As the Deer Pants for the Water"
    }
  ],
  "psalms:43": [
    {
      "verse": 1,
      "title": "Send Out Your Light"
    }
  ],
  "psalms:44": [
    {
      "verse": 1,
      "title": "Redeem Us, O God"
    }
  ],
  "psalms:45": [
    {
      "verse": 1,
      "title": "My Heart Is Stirred by a Noble Theme"
    }
  ],
  "psalms:46": [
    {
      "verse": 1,
      "title": "God Is Our Refuge and Strength"
    }
  ],
  "psalms:47": [
    {
      "verse": 1,
      "title": "Clap Your Hands, All You Peoples"
    }
  ],
  "psalms:48": [
    {
      "verse": 1,
      "title": "Broken Bondage"
    }
  ],
  "psalms:49": [
    {
      "verse": 1,
      "title": "The Evanescence of Wealth"
    }
  ],
  "psalms:50": [
    {
      "verse": 1,
      "title": "The Mighty One Calls"
    }
  ],
  "psalms:51": [
    {
      "verse": 1,
      "title": "Create in Me a Clean Heart, O God"
    }
  ],
  "psalms:52": [
    {
      "verse": 1,
      "title": "Why Do You Boast of Evil?"
    }
  ],
  "psalms:53": [
    {
      "verse": 1,
      "title": "The Fool Says There Is No God"
    }
  ],
  "psalms:54": [
    {
      "verse": 1,
      "title": "Save Me by Your Name"
    }
  ],
  "psalms:55": [
    {
      "verse": 1,
      "title": "Cast Your Burden upon the LORD"
    }
  ],
  "psalms:56": [
    {
      "verse": 1,
      "title": "Be Merciful to Me, O God"
    }
  ],
  "psalms:57": [
    {
      "verse": 1,
      "title": "In You My Soul Takes Refuge"
    }
  ],
  "psalms:58": [
    {
      "verse": 1,
      "title": "God Judges the Earth"
    }
  ],
  "psalms:59": [
    {
      "verse": 1,
      "title": "Deliver Me from My Enemies"
    }
  ],
  "psalms:60": [
    {
      "verse": 1,
      "title": "Victory with God"
    }
  ],
  "psalms:61": [
    {
      "verse": 1,
      "title": "You Have Heard My Vows"
    }
  ],
  "psalms:62": [
    {
      "verse": 1,
      "title": "Waiting on God"
    }
  ],
  "psalms:63": [
    {
      "verse": 1,
      "title": "Thirsting for God"
    }
  ],
  "psalms:64": [
    {
      "verse": 1,
      "title": "The Hurtful Tongue"
    }
  ],
  "psalms:65": [
    {
      "verse": 1,
      "title": "Praise Awaits God in Zion"
    }
  ],
  "psalms:66": [
    {
      "verse": 1,
      "title": "Make a Joyful Noise"
    }
  ],
  "psalms:67": [
    {
      "verse": 1,
      "title": "May God Cause His Face to Shine upon Us"
    }
  ],
  "psalms:68": [
    {
      "verse": 1,
      "title": "God’s Enemies Are Scattered"
    }
  ],
  "psalms:69": [
    {
      "verse": 1,
      "title": "The Waters Are up to My Neck"
    }
  ],
  "psalms:70": [
    {
      "verse": 1,
      "title": "Hurry, O LORD, to Help Me!"
    }
  ],
  "psalms:71": [
    {
      "verse": 1,
      "title": "Be My Rock of Refuge"
    }
  ],
  "psalms:72": [
    {
      "verse": 1,
      "title": "Endow the King with Your Justice"
    }
  ],
  "psalms:73": [
    {
      "verse": 1,
      "title": "Surely God Is Good to Israel"
    }
  ],
  "psalms:74": [
    {
      "verse": 1,
      "title": "Why Have You Rejected Us Forever?"
    }
  ],
  "psalms:75": [
    {
      "verse": 1,
      "title": "God’s Righteous Judgment"
    }
  ],
  "psalms:76": [
    {
      "verse": 1,
      "title": "God’s Name Is Great in Israel"
    }
  ],
  "psalms:77": [
    {
      "verse": 1,
      "title": "In the Day of Trouble I Sought the Lord"
    }
  ],
  "psalms:78": [
    {
      "verse": 1,
      "title": "I Will Open My Mouth in Parables"
    }
  ],
  "psalms:79": [
    {
      "verse": 1,
      "title": "A Prayer for Deliverance"
    }
  ],
  "psalms:80": [
    {
      "verse": 1,
      "title": "Hear Us, O Shepherd of Israel"
    }
  ],
  "psalms:81": [
    {
      "verse": 1,
      "title": "Sing for Joy to God Our Strength"
    }
  ],
  "psalms:82": [
    {
      "verse": 1,
      "title": "God Presides in the Divine Assembly"
    }
  ],
  "psalms:83": [
    {
      "verse": 1,
      "title": "O God, Be Not Silent"
    }
  ],
  "psalms:84": [
    {
      "verse": 1,
      "title": "Better Is One Day in Your Courts"
    }
  ],
  "psalms:85": [
    {
      "verse": 1,
      "title": "You Showed Favor to Your Land"
    }
  ],
  "psalms:86": [
    {
      "verse": 1,
      "title": "Tried but Trusting"
    }
  ],
  "psalms:87": [
    {
      "verse": 1,
      "title": "The LORD Loves the Gates of Zion"
    }
  ],
  "psalms:88": [
    {
      "verse": 1,
      "title": "I Cry Out before You"
    }
  ],
  "psalms:89": [
    {
      "verse": 1,
      "title": "I Will Sing of His Love Forever"
    }
  ],
  "psalms:90": [
    {
      "verse": 1,
      "title": "From Everlasting to Everlasting"
    }
  ],
  "psalms:91": [
    {
      "verse": 1,
      "title": "You Are My Refuge and My Fortress"
    }
  ],
  "psalms:92": [
    {
      "verse": 1,
      "title": "How Great Are Your Works!"
    }
  ],
  "psalms:93": [
    {
      "verse": 1,
      "title": "The LORD Reigns!"
    }
  ],
  "psalms:94": [
    {
      "verse": 1,
      "title": "The LORD Will Not Forget His People"
    }
  ],
  "psalms:95": [
    {
      "verse": 1,
      "title": "Do Not Harden Your Hearts"
    }
  ],
  "psalms:96": [
    {
      "verse": 1,
      "title": "Sing to the LORD, All the Earth"
    }
  ],
  "psalms:97": [
    {
      "verse": 1,
      "title": "Let the Earth Rejoice"
    }
  ],
  "psalms:98": [
    {
      "verse": 1,
      "title": "Sing to the LORD a New Song"
    }
  ],
  "psalms:99": [
    {
      "verse": 1,
      "title": "The LORD Reigns!"
    }
  ],
  "psalms:100": [
    {
      "verse": 1,
      "title": "Make a Joyful Noise"
    }
  ],
  "psalms:101": [
    {
      "verse": 1,
      "title": "I Will Set No Worthless Thing before My Eyes"
    }
  ],
  "psalms:102": [
    {
      "verse": 1,
      "title": "The Prayer of the Afflicted"
    }
  ],
  "psalms:103": [
    {
      "verse": 1,
      "title": "Bless the LORD, O My Soul"
    }
  ],
  "psalms:104": [
    {
      "verse": 1,
      "title": "How Many Are Your Works, O LORD!"
    }
  ],
  "psalms:105": [
    {
      "verse": 1,
      "title": "Tell of His Wonders"
    }
  ],
  "psalms:106": [
    {
      "verse": 1,
      "title": "Give Thanks to the LORD, for He Is Good"
    }
  ],
  "psalms:107": [
    {
      "verse": 1,
      "title": "Thanksgiving for Deliverance"
    }
  ],
  "psalms:108": [
    {
      "verse": 1,
      "title": "Israel’s Kingdom Blessing"
    }
  ],
  "psalms:109": [
    {
      "verse": 1,
      "title": "The Song of the Slandered"
    }
  ],
  "psalms:110": [
    {
      "verse": 1,
      "title": "God’s Faithful Messiah"
    }
  ],
  "psalms:111": [
    {
      "verse": 1,
      "title": "Majestic Is His Work"
    }
  ],
  "psalms:112": [
    {
      "verse": 1,
      "title": "The Blessed Fear of the LORD"
    }
  ],
  "psalms:113": [
    {
      "verse": 1,
      "title": "The LORD Exalts the Humble"
    }
  ],
  "psalms:114": [
    {
      "verse": 1,
      "title": "A Psalm of Exodus"
    }
  ],
  "psalms:115": [
    {
      "verse": 1,
      "title": "To Your Name Be the Glory"
    }
  ],
  "psalms:116": [
    {
      "verse": 1,
      "title": "The LORD Has Heard My Voice"
    }
  ],
  "psalms:117": [
    {
      "verse": 1,
      "title": "Extol Him, All You Peoples"
    }
  ],
  "psalms:118": [
    {
      "verse": 1,
      "title": "The LORD Is on My Side"
    }
  ],
  "psalms:119": [
    {
      "verse": 1,
      "title": "Your Word Is a Lamp to My Feet"
    }
  ],
  "psalms:120": [
    {
      "verse": 1,
      "title": "In My Distress I Cried to the LORD"
    }
  ],
  "psalms:121": [
    {
      "verse": 1,
      "title": "I Lift Up My Eyes to the Hills"
    }
  ],
  "psalms:122": [
    {
      "verse": 1,
      "title": "Pray for the Peace of Jerusalem"
    }
  ],
  "psalms:123": [
    {
      "verse": 1,
      "title": "I Lift Up My Eyes to You"
    }
  ],
  "psalms:124": [
    {
      "verse": 1,
      "title": "Our Help Is in the Name of the LORD"
    }
  ],
  "psalms:125": [
    {
      "verse": 1,
      "title": "The LORD Surrounds His People"
    }
  ],
  "psalms:126": [
    {
      "verse": 1,
      "title": "Zion’s Captives Restored"
    }
  ],
  "psalms:127": [
    {
      "verse": 1,
      "title": "Children Are a Heritage from the LORD"
    }
  ],
  "psalms:128": [
    {
      "verse": 1,
      "title": "The Blessed Fear of the LORD"
    }
  ],
  "psalms:129": [
    {
      "verse": 1,
      "title": "The Cords of the Wicked"
    }
  ],
  "psalms:130": [
    {
      "verse": 1,
      "title": "Out of the Depths"
    }
  ],
  "psalms:131": [
    {
      "verse": 1,
      "title": "I Have Stilled My Soul"
    }
  ],
  "psalms:132": [
    {
      "verse": 1,
      "title": "The LORD Has Chosen Zion"
    }
  ],
  "psalms:133": [
    {
      "verse": 1,
      "title": "How Pleasant to Live in Harmony!"
    }
  ],
  "psalms:134": [
    {
      "verse": 1,
      "title": "Bless the LORD, All You Servants"
    }
  ],
  "psalms:135": [
    {
      "verse": 1,
      "title": "Give Praise, O Servants of the LORD"
    }
  ],
  "psalms:136": [
    {
      "verse": 1,
      "title": "His Loving Devotion Endures Forever"
    }
  ],
  "psalms:137": [
    {
      "verse": 1,
      "title": "By the Rivers of Babylon"
    }
  ],
  "psalms:138": [
    {
      "verse": 1,
      "title": "A Thankful Heart"
    }
  ],
  "psalms:139": [
    {
      "verse": 1,
      "title": "You Have Searched Me and Known Me"
    }
  ],
  "psalms:140": [
    {
      "verse": 1,
      "title": "Rescue Me from Evil Men"
    }
  ],
  "psalms:141": [
    {
      "verse": 1,
      "title": "Come Quickly to Me"
    }
  ],
  "psalms:142": [
    {
      "verse": 1,
      "title": "I Lift My Voice to the LORD"
    }
  ],
  "psalms:143": [
    {
      "verse": 1,
      "title": "I Stretch Out My Hands to You"
    }
  ],
  "psalms:144": [
    {
      "verse": 1,
      "title": "Blessed Be the LORD, My Rock"
    }
  ],
  "psalms:145": [
    {
      "verse": 1,
      "title": "I Will Exalt You, My God and King"
    }
  ],
  "psalms:146": [
    {
      "verse": 1,
      "title": "Praise the LORD, O My Soul"
    }
  ],
  "psalms:147": [
    {
      "verse": 1,
      "title": "It Is Good to Sing Praises"
    }
  ],
  "psalms:148": [
    {
      "verse": 1,
      "title": "Praise the LORD from the Heavens"
    }
  ],
  "psalms:149": [
    {
      "verse": 1,
      "title": "Sing to the LORD a New Song"
    }
  ],
  "psalms:150": [
    {
      "verse": 1,
      "title": "Let Everything That Has Breath Praise the LORD"
    }
  ],
  "proverbs:1": [
    {
      "verse": 1,
      "title": "The Beginning of Knowledge"
    },
    {
      "verse": 8,
      "title": "The Enticement of Sin"
    },
    {
      "verse": 20,
      "title": "Wisdom Calls Aloud"
    }
  ],
  "proverbs:2": [
    {
      "verse": 1,
      "title": "The Benefits of Wisdom"
    }
  ],
  "proverbs:3": [
    {
      "verse": 1,
      "title": "Trust in the LORD with All Your Heart"
    },
    {
      "verse": 13,
      "title": "The Blessings of Wisdom"
    }
  ],
  "proverbs:4": [
    {
      "verse": 1,
      "title": "A Father’s Instruction"
    }
  ],
  "proverbs:5": [
    {
      "verse": 1,
      "title": "Avoiding Immorality"
    }
  ],
  "proverbs:6": [
    {
      "verse": 1,
      "title": "Warnings against Foolishness"
    },
    {
      "verse": 20,
      "title": "Warnings against Adultery"
    }
  ],
  "proverbs:7": [
    {
      "verse": 1,
      "title": "Warnings about the Adulteress"
    }
  ],
  "proverbs:8": [
    {
      "verse": 1,
      "title": "The Excellence of Wisdom"
    }
  ],
  "proverbs:9": [
    {
      "verse": 1,
      "title": "The Way of Wisdom"
    },
    {
      "verse": 13,
      "title": "The Way of Folly"
    }
  ],
  "proverbs:10": [
    {
      "verse": 1,
      "title": "Solomon’s Proverbs: The Wise Son"
    }
  ],
  "proverbs:11": [
    {
      "verse": 1,
      "title": "Dishonest Scales"
    }
  ],
  "proverbs:12": [
    {
      "verse": 1,
      "title": "Loving Discipline and Knowledge"
    }
  ],
  "proverbs:13": [
    {
      "verse": 1,
      "title": "A Father’s Discipline"
    }
  ],
  "proverbs:14": [
    {
      "verse": 1,
      "title": "The Wise Woman"
    }
  ],
  "proverbs:15": [
    {
      "verse": 1,
      "title": "A Gentle Answer Turns Away Wrath"
    }
  ],
  "proverbs:16": [
    {
      "verse": 1,
      "title": "The Reply of the Tongue Is from the LORD"
    }
  ],
  "proverbs:17": [
    {
      "verse": 1,
      "title": "Better a Dry Morsel in Quietness"
    }
  ],
  "proverbs:18": [
    {
      "verse": 1,
      "title": "The Selfishness of the Unfriendly"
    }
  ],
  "proverbs:19": [
    {
      "verse": 1,
      "title": "The Man of Integrity"
    }
  ],
  "proverbs:20": [
    {
      "verse": 1,
      "title": "Wine Is a Mocker"
    }
  ],
  "proverbs:21": [
    {
      "verse": 1,
      "title": "The King’s Heart"
    }
  ],
  "proverbs:22": [
    {
      "verse": 1,
      "title": "A Good Name"
    },
    {
      "verse": 17,
      "title": "Saying 1"
    },
    {
      "verse": 22,
      "title": "Saying 2"
    },
    {
      "verse": 24,
      "title": "Saying 3"
    },
    {
      "verse": 26,
      "title": "Saying 4"
    },
    {
      "verse": 28,
      "title": "Saying 5"
    },
    {
      "verse": 29,
      "title": "Saying 6"
    }
  ],
  "proverbs:23": [
    {
      "verse": 1,
      "title": "Saying 7"
    },
    {
      "verse": 4,
      "title": "Saying 8"
    },
    {
      "verse": 6,
      "title": "Saying 9"
    },
    {
      "verse": 9,
      "title": "Saying 10"
    },
    {
      "verse": 10,
      "title": "Saying 11"
    },
    {
      "verse": 12,
      "title": "Saying 12"
    },
    {
      "verse": 13,
      "title": "Saying 13"
    },
    {
      "verse": 15,
      "title": "Saying 14"
    },
    {
      "verse": 17,
      "title": "Saying 15"
    },
    {
      "verse": 19,
      "title": "Saying 16"
    },
    {
      "verse": 22,
      "title": "Saying 17"
    },
    {
      "verse": 26,
      "title": "Saying 18"
    },
    {
      "verse": 29,
      "title": "Saying 19"
    }
  ],
  "proverbs:24": [
    {
      "verse": 1,
      "title": "Saying 20"
    },
    {
      "verse": 3,
      "title": "Saying 21"
    },
    {
      "verse": 5,
      "title": "Saying 22"
    },
    {
      "verse": 7,
      "title": "Saying 23"
    },
    {
      "verse": 8,
      "title": "Saying 24"
    },
    {
      "verse": 10,
      "title": "Saying 25"
    },
    {
      "verse": 13,
      "title": "Saying 26"
    },
    {
      "verse": 15,
      "title": "Saying 27"
    },
    {
      "verse": 17,
      "title": "Saying 28"
    },
    {
      "verse": 19,
      "title": "Saying 29"
    },
    {
      "verse": 21,
      "title": "Saying 30"
    },
    {
      "verse": 23,
      "title": "Further Sayings of the Wise"
    }
  ],
  "proverbs:25": [
    {
      "verse": 1,
      "title": "More Proverbs of Solomon"
    }
  ],
  "proverbs:26": [
    {
      "verse": 1,
      "title": "Similitudes and Instructions"
    }
  ],
  "proverbs:27": [
    {
      "verse": 1,
      "title": "Do Not Boast about Tomorrow"
    }
  ],
  "proverbs:28": [
    {
      "verse": 1,
      "title": "The Boldness of the Righteous"
    }
  ],
  "proverbs:29": [
    {
      "verse": 1,
      "title": "The Flourishing of the Righteous"
    }
  ],
  "proverbs:30": [
    {
      "verse": 1,
      "title": "The Words of Agur"
    }
  ],
  "proverbs:31": [
    {
      "verse": 1,
      "title": "The Sayings for King Lemuel"
    },
    {
      "verse": 10,
      "title": "The Virtues of a Noble Woman"
    }
  ],
  "ecclesiastes:1": [
    {
      "verse": 1,
      "title": "Everything Is Futile"
    },
    {
      "verse": 12,
      "title": "With Wisdom Comes Sorrow"
    }
  ],
  "ecclesiastes:2": [
    {
      "verse": 1,
      "title": "The Futility of Pleasure"
    },
    {
      "verse": 12,
      "title": "The Wise and the Foolish"
    },
    {
      "verse": 18,
      "title": "The Futility of Work"
    }
  ],
  "ecclesiastes:3": [
    {
      "verse": 1,
      "title": "To Everything There Is a Season"
    },
    {
      "verse": 9,
      "title": "God’s Works Remain Forever"
    },
    {
      "verse": 16,
      "title": "From Dust to Dust"
    }
  ],
  "ecclesiastes:4": [
    {
      "verse": 1,
      "title": "The Evil of Oppression"
    },
    {
      "verse": 13,
      "title": "The Futility of Power"
    }
  ],
  "ecclesiastes:5": [
    {
      "verse": 1,
      "title": "Approaching God with Fear"
    },
    {
      "verse": 8,
      "title": "The Futility of Wealth"
    }
  ],
  "ecclesiastes:6": [
    {
      "verse": 1,
      "title": "The Futility of Life"
    }
  ],
  "ecclesiastes:7": [
    {
      "verse": 1,
      "title": "The Value of Wisdom"
    },
    {
      "verse": 15,
      "title": "The Limits of Human Wisdom"
    }
  ],
  "ecclesiastes:8": [
    {
      "verse": 1,
      "title": "Obey the King"
    },
    {
      "verse": 10,
      "title": "Fear God"
    },
    {
      "verse": 14,
      "title": "God’s Ways Are Mysterious"
    }
  ],
  "ecclesiastes:9": [
    {
      "verse": 1,
      "title": "Death Comes to Good and Bad"
    },
    {
      "verse": 7,
      "title": "Enjoy Your Portion in This Life"
    },
    {
      "verse": 13,
      "title": "Wisdom Is Better than Strength"
    }
  ],
  "ecclesiastes:10": [
    {
      "verse": 1,
      "title": "Wisdom and Folly"
    }
  ],
  "ecclesiastes:11": [
    {
      "verse": 1,
      "title": "Cast Your Bread upon the Waters"
    },
    {
      "verse": 7,
      "title": "Enjoy Your Years"
    }
  ],
  "ecclesiastes:12": [
    {
      "verse": 1,
      "title": "Remember Your Creator"
    },
    {
      "verse": 9,
      "title": "The Whole Duty of Man"
    }
  ],
  "songofsolomon:1": [
    {
      "verse": 1,
      "title": "The Bride Confesses Her Love"
    },
    {
      "verse": 2,
      "title": "The Bride"
    },
    {
      "verse": 5,
      "title": "The Bride"
    },
    {
      "verse": 8,
      "title": "The Friends"
    },
    {
      "verse": 9,
      "title": "The Bridegroom"
    },
    {
      "verse": 11,
      "title": "The Friends"
    },
    {
      "verse": 12,
      "title": "The Bride"
    },
    {
      "verse": 15,
      "title": "The Bridegroom"
    },
    {
      "verse": 16,
      "title": "The Bride"
    },
    {
      "verse": 17,
      "title": "The Bridegroom"
    }
  ],
  "songofsolomon:2": [
    {
      "verse": 1,
      "title": "The Bride"
    },
    {
      "verse": 2,
      "title": "The Bridegroom"
    },
    {
      "verse": 3,
      "title": "The Bride"
    },
    {
      "verse": 14,
      "title": "The Bridegroom"
    },
    {
      "verse": 15,
      "title": "The Friends"
    },
    {
      "verse": 16,
      "title": "The Bride"
    }
  ],
  "songofsolomon:3": [
    {
      "verse": 1,
      "title": "The Bride’s Dream"
    },
    {
      "verse": 6,
      "title": "Solomon Arrives on His Wedding Day"
    }
  ],
  "songofsolomon:4": [
    {
      "verse": 1,
      "title": "The Bridegroom"
    },
    {
      "verse": 16,
      "title": "The Bride"
    }
  ],
  "songofsolomon:5": [
    {
      "verse": 1,
      "title": "The Bridegroom"
    },
    {
      "verse": 2,
      "title": "The Bride"
    },
    {
      "verse": 9,
      "title": "The Friends"
    },
    {
      "verse": 10,
      "title": "The Bride"
    }
  ],
  "songofsolomon:6": [
    {
      "verse": 1,
      "title": "The Friends"
    },
    {
      "verse": 2,
      "title": "The Bride"
    },
    {
      "verse": 4,
      "title": "The Bridegroom"
    },
    {
      "verse": 10,
      "title": "The Friends"
    },
    {
      "verse": 11,
      "title": "The Bridegroom"
    },
    {
      "verse": 13,
      "title": "The Friends"
    }
  ],
  "songofsolomon:7": [
    {
      "verse": 1,
      "title": "Admiration by the Bridegroom"
    },
    {
      "verse": 10,
      "title": "The Bride"
    }
  ],
  "songofsolomon:8": [
    {
      "verse": 1,
      "title": "Longing for Her Beloved"
    },
    {
      "verse": 5,
      "title": "The Friends"
    },
    {
      "verse": 6,
      "title": "The Bride"
    },
    {
      "verse": 8,
      "title": "The Friends"
    },
    {
      "verse": 10,
      "title": "The Bride"
    },
    {
      "verse": 13,
      "title": "The Bridegroom"
    },
    {
      "verse": 14,
      "title": "The Bride"
    }
  ],
  "isaiah:1": [
    {
      "verse": 1,
      "title": "Judah’s Rebellion"
    },
    {
      "verse": 10,
      "title": "Meaningless Offerings"
    },
    {
      "verse": 21,
      "title": "The Corruption of Zion"
    }
  ],
  "isaiah:2": [
    {
      "verse": 1,
      "title": "The Mountain of the House of the LORD"
    },
    {
      "verse": 5,
      "title": "The Day of Reckoning"
    }
  ],
  "isaiah:3": [
    {
      "verse": 1,
      "title": "Judgment on Jerusalem and Judah"
    },
    {
      "verse": 16,
      "title": "A Warning to the Daughters of Zion"
    }
  ],
  "isaiah:4": [
    {
      "verse": 1,
      "title": "A Remnant in Zion"
    }
  ],
  "isaiah:5": [
    {
      "verse": 1,
      "title": "The Song of the Vineyard"
    },
    {
      "verse": 8,
      "title": "Woes to the Wicked"
    }
  ],
  "isaiah:6": [
    {
      "verse": 1,
      "title": "Isaiah’s Commission"
    }
  ],
  "isaiah:7": [
    {
      "verse": 1,
      "title": "A Message to Ahaz"
    },
    {
      "verse": 10,
      "title": "The Sign of Immanuel"
    },
    {
      "verse": 17,
      "title": "Judgment to Come"
    }
  ],
  "isaiah:8": [
    {
      "verse": 1,
      "title": "Assyrian Invasion Prophesied"
    },
    {
      "verse": 11,
      "title": "A Call to Fear God"
    },
    {
      "verse": 19,
      "title": "Darkness and Light"
    }
  ],
  "isaiah:9": [
    {
      "verse": 1,
      "title": "Unto Us a Child Is Born"
    },
    {
      "verse": 8,
      "title": "Judgment against Israel’s Pride"
    },
    {
      "verse": 13,
      "title": "Judgment against Israel’s Hypocrisy"
    },
    {
      "verse": 18,
      "title": "Judgment against Israel’s Unrepentance"
    }
  ],
  "isaiah:10": [
    {
      "verse": 1,
      "title": "Woe to Tyrants"
    },
    {
      "verse": 5,
      "title": "Judgment on Assyria"
    },
    {
      "verse": 20,
      "title": "A Remnant Shall Return"
    }
  ],
  "isaiah:11": [
    {
      "verse": 1,
      "title": "The Root of Jesse"
    }
  ],
  "isaiah:12": [
    {
      "verse": 1,
      "title": "Joyful Thanksgiving"
    }
  ],
  "isaiah:13": [
    {
      "verse": 1,
      "title": "The Burden against Babylon"
    }
  ],
  "isaiah:14": [
    {
      "verse": 1,
      "title": "Restoration for Israel"
    },
    {
      "verse": 3,
      "title": "The Fall of the King of Babylon"
    },
    {
      "verse": 24,
      "title": "God’s Purpose against Assyria"
    },
    {
      "verse": 28,
      "title": "Philistia Will Be Destroyed"
    }
  ],
  "isaiah:15": [
    {
      "verse": 1,
      "title": "The Burden against Moab"
    }
  ],
  "isaiah:16": [
    {
      "verse": 1,
      "title": "Moab’s Destruction"
    }
  ],
  "isaiah:17": [
    {
      "verse": 1,
      "title": "The Burden against Damascus"
    }
  ],
  "isaiah:18": [
    {
      "verse": 1,
      "title": "A Message to Cush"
    }
  ],
  "isaiah:19": [
    {
      "verse": 1,
      "title": "The Burden against Egypt"
    },
    {
      "verse": 16,
      "title": "A Blessing upon the Earth"
    }
  ],
  "isaiah:20": [
    {
      "verse": 1,
      "title": "A Sign against Egypt and Cush"
    }
  ],
  "isaiah:21": [
    {
      "verse": 1,
      "title": "Babylon Is Fallen"
    },
    {
      "verse": 11,
      "title": "The Burden against Edom"
    },
    {
      "verse": 13,
      "title": "The Burden against Arabia"
    }
  ],
  "isaiah:22": [
    {
      "verse": 1,
      "title": "The Valley of Vision"
    },
    {
      "verse": 15,
      "title": "A Message for Shebna"
    }
  ],
  "isaiah:23": [
    {
      "verse": 1,
      "title": "The Burden against Tyre"
    }
  ],
  "isaiah:24": [
    {
      "verse": 1,
      "title": "God’s Judgment on the Earth"
    }
  ],
  "isaiah:25": [
    {
      "verse": 1,
      "title": "Praise to the Victorious God"
    }
  ],
  "isaiah:26": [
    {
      "verse": 1,
      "title": "A Song of Salvation"
    }
  ],
  "isaiah:27": [
    {
      "verse": 1,
      "title": "The LORD’s Vineyard"
    }
  ],
  "isaiah:28": [
    {
      "verse": 1,
      "title": "The Captivity of Ephraim"
    },
    {
      "verse": 14,
      "title": "A Cornerstone in Zion"
    },
    {
      "verse": 23,
      "title": "Listen and Hear"
    }
  ],
  "isaiah:29": [
    {
      "verse": 1,
      "title": "Woe to David’s City"
    },
    {
      "verse": 17,
      "title": "Sanctification for the Godly"
    }
  ],
  "isaiah:30": [
    {
      "verse": 1,
      "title": "The Worthless Treaty with Egypt"
    },
    {
      "verse": 18,
      "title": "God Will Be Gracious"
    }
  ],
  "isaiah:31": [
    {
      "verse": 1,
      "title": "Woe to Those Who Rely on Egypt"
    }
  ],
  "isaiah:32": [
    {
      "verse": 1,
      "title": "A Righteous King"
    },
    {
      "verse": 9,
      "title": "The Women of Jerusalem"
    }
  ],
  "isaiah:33": [
    {
      "verse": 1,
      "title": "The LORD Is Exalted"
    }
  ],
  "isaiah:34": [
    {
      "verse": 1,
      "title": "Judgment on the Nations"
    },
    {
      "verse": 5,
      "title": "Judgment on Edom"
    }
  ],
  "isaiah:35": [
    {
      "verse": 1,
      "title": "The Glory of Zion"
    }
  ],
  "isaiah:36": [
    {
      "verse": 1,
      "title": "Sennacherib Threatens Jerusalem"
    }
  ],
  "isaiah:37": [
    {
      "verse": 1,
      "title": "Isaiah’s Message of Deliverance"
    },
    {
      "verse": 8,
      "title": "Sennacherib’s Blasphemous Letter"
    },
    {
      "verse": 14,
      "title": "Hezekiah’s Prayer"
    },
    {
      "verse": 21,
      "title": "Sennacherib’s Fall Prophesied"
    },
    {
      "verse": 36,
      "title": "Jerusalem Delivered from the Assyrians"
    }
  ],
  "isaiah:38": [
    {
      "verse": 1,
      "title": "Hezekiah’s Illness and Recovery"
    },
    {
      "verse": 9,
      "title": "Hezekiah’s Song of Thanksgiving"
    }
  ],
  "isaiah:39": [
    {
      "verse": 1,
      "title": "Hezekiah Shows His Treasures"
    }
  ],
  "isaiah:40": [
    {
      "verse": 1,
      "title": "Prepare the Way for the LORD"
    },
    {
      "verse": 6,
      "title": "The Enduring Word"
    },
    {
      "verse": 9,
      "title": "Here Is Your God!"
    }
  ],
  "isaiah:41": [
    {
      "verse": 1,
      "title": "God’s Help to Israel"
    },
    {
      "verse": 21,
      "title": "Meaningless Idols"
    }
  ],
  "isaiah:42": [
    {
      "verse": 1,
      "title": "Here Is My Servant"
    },
    {
      "verse": 10,
      "title": "A New Song of Praise"
    },
    {
      "verse": 18,
      "title": "Israel Is Deaf and Blind"
    }
  ],
  "isaiah:43": [
    {
      "verse": 1,
      "title": "Israel’s Only Savior"
    },
    {
      "verse": 14,
      "title": "A Way in the Wilderness"
    },
    {
      "verse": 22,
      "title": "Israel’s Unfaithfulness"
    }
  ],
  "isaiah:44": [
    {
      "verse": 1,
      "title": "The LORD Has Chosen Israel"
    },
    {
      "verse": 21,
      "title": "Jerusalem to Be Restored"
    }
  ],
  "isaiah:45": [
    {
      "verse": 1,
      "title": "God Calls Cyrus"
    }
  ],
  "isaiah:46": [
    {
      "verse": 1,
      "title": "Babylon’s Idols"
    }
  ],
  "isaiah:47": [
    {
      "verse": 1,
      "title": "The Humiliation of Babylon"
    }
  ],
  "isaiah:48": [
    {
      "verse": 1,
      "title": "Israel’s Stubbornness"
    },
    {
      "verse": 12,
      "title": "Deliverance Promised to Israel"
    }
  ],
  "isaiah:49": [
    {
      "verse": 1,
      "title": "The Servant and Light to the Gentiles"
    }
  ],
  "isaiah:50": [
    {
      "verse": 1,
      "title": "Israel’s Sin"
    },
    {
      "verse": 4,
      "title": "The Servant’s Obedience"
    }
  ],
  "isaiah:51": [
    {
      "verse": 1,
      "title": "Salvation for Zion"
    },
    {
      "verse": 17,
      "title": "God’s Fury Removed"
    }
  ],
  "isaiah:52": [
    {
      "verse": 1,
      "title": "Deliverance for Jerusalem"
    },
    {
      "verse": 13,
      "title": "The Servant Exalted"
    }
  ],
  "isaiah:53": [
    {
      "verse": 1,
      "title": "The Suffering Servant"
    },
    {
      "verse": 9,
      "title": "A Grave Assigned"
    }
  ],
  "isaiah:54": [
    {
      "verse": 1,
      "title": "Future Blessings for Zion"
    }
  ],
  "isaiah:55": [
    {
      "verse": 1,
      "title": "Invitation to the Needy"
    }
  ],
  "isaiah:56": [
    {
      "verse": 1,
      "title": "Salvation for Foreigners"
    },
    {
      "verse": 9,
      "title": "Israel’s Sinful Leaders"
    }
  ],
  "isaiah:57": [
    {
      "verse": 1,
      "title": "The Blessed Death of the Righteous"
    },
    {
      "verse": 3,
      "title": "God Condemns Idolatry"
    },
    {
      "verse": 14,
      "title": "Healing for the Repentant"
    }
  ],
  "isaiah:58": [
    {
      "verse": 1,
      "title": "True Fasts and Sabbaths"
    }
  ],
  "isaiah:59": [
    {
      "verse": 1,
      "title": "Sin Separates Us from God"
    },
    {
      "verse": 18,
      "title": "The Covenant of the Redeemer"
    }
  ],
  "isaiah:60": [
    {
      "verse": 1,
      "title": "Future Glory for Zion"
    }
  ],
  "isaiah:61": [
    {
      "verse": 1,
      "title": "The Year of the LORD’s Favor"
    }
  ],
  "isaiah:62": [
    {
      "verse": 1,
      "title": "Zion’s Salvation and New Name"
    }
  ],
  "isaiah:63": [
    {
      "verse": 1,
      "title": "God’s Vengeance on the Nations"
    },
    {
      "verse": 7,
      "title": "God’s Mercies Recalled"
    },
    {
      "verse": 15,
      "title": "A Prayer for Mercy"
    }
  ],
  "isaiah:64": [
    {
      "verse": 1,
      "title": "A Prayer for God’s Power"
    }
  ],
  "isaiah:65": [
    {
      "verse": 1,
      "title": "Judgments and Promises"
    },
    {
      "verse": 17,
      "title": "A New Heaven and a New Earth"
    }
  ],
  "isaiah:66": [
    {
      "verse": 1,
      "title": "Heaven Is My Throne"
    },
    {
      "verse": 7,
      "title": "Rejoice with Jerusalem"
    },
    {
      "verse": 15,
      "title": "Final Judgments against the Wicked"
    }
  ],
  "jeremiah:1": [
    {
      "verse": 1,
      "title": "The Call of Jeremiah"
    }
  ],
  "jeremiah:2": [
    {
      "verse": 1,
      "title": "Israel Has Forsaken God"
    },
    {
      "verse": 14,
      "title": "The Consequence of Israel’s Sin"
    },
    {
      "verse": 23,
      "title": "Israel’s Unfaithfulness"
    }
  ],
  "jeremiah:3": [
    {
      "verse": 1,
      "title": "The Wages of the Harlot"
    },
    {
      "verse": 6,
      "title": "Judah Follows Israel’s Example"
    },
    {
      "verse": 11,
      "title": "A Call to Repentance"
    }
  ],
  "jeremiah:4": [
    {
      "verse": 1,
      "title": "A Plea to Return"
    },
    {
      "verse": 5,
      "title": "Disaster from the North"
    },
    {
      "verse": 19,
      "title": "Lamentation for Judah"
    }
  ],
  "jeremiah:5": [
    {
      "verse": 1,
      "title": "No One Is Just"
    },
    {
      "verse": 14,
      "title": "Judgment Proclaimed"
    }
  ],
  "jeremiah:6": [
    {
      "verse": 1,
      "title": "Jerusalem’s Final Warning"
    },
    {
      "verse": 22,
      "title": "An Invasion from the North"
    }
  ],
  "jeremiah:7": [
    {
      "verse": 1,
      "title": "Jeremiah’s Message at the Temple Gate"
    },
    {
      "verse": 16,
      "title": "Judah’s Idolatry Persists"
    },
    {
      "verse": 30,
      "title": "The Valley of Slaughter"
    }
  ],
  "jeremiah:8": [
    {
      "verse": 1,
      "title": "Judah’s Sin and Punishment"
    },
    {
      "verse": 14,
      "title": "The People Respond"
    },
    {
      "verse": 18,
      "title": "Jeremiah Weeps for His People"
    }
  ],
  "jeremiah:9": [
    {
      "verse": 1,
      "title": "A Lament over Zion"
    }
  ],
  "jeremiah:10": [
    {
      "verse": 1,
      "title": "The Sovereignty of God"
    },
    {
      "verse": 17,
      "title": "The Coming Captivity of Judah"
    }
  ],
  "jeremiah:11": [
    {
      "verse": 1,
      "title": "The Broken Covenant"
    },
    {
      "verse": 18,
      "title": "A Plot against Jeremiah"
    }
  ],
  "jeremiah:12": [
    {
      "verse": 1,
      "title": "The Prosperity of the Wicked"
    },
    {
      "verse": 5,
      "title": "God’s Answer to Jeremiah"
    },
    {
      "verse": 14,
      "title": "A Message for Israel’s Neighbors"
    }
  ],
  "jeremiah:13": [
    {
      "verse": 1,
      "title": "The Linen Loincloth"
    },
    {
      "verse": 12,
      "title": "The Wineskins"
    },
    {
      "verse": 15,
      "title": "Captivity Threatened"
    }
  ],
  "jeremiah:14": [
    {
      "verse": 1,
      "title": "Drought, Famine, Sword, and Plague"
    },
    {
      "verse": 19,
      "title": "A Prayer for Mercy"
    }
  ],
  "jeremiah:15": [
    {
      "verse": 1,
      "title": "Judgment to Continue"
    },
    {
      "verse": 10,
      "title": "Jeremiah’s Woe"
    },
    {
      "verse": 19,
      "title": "The LORD’s Promise"
    }
  ],
  "jeremiah:16": [
    {
      "verse": 1,
      "title": "Disaster Predicted"
    },
    {
      "verse": 14,
      "title": "God Will Restore Israel"
    }
  ],
  "jeremiah:17": [
    {
      "verse": 1,
      "title": "The Sin and Punishment of Judah"
    },
    {
      "verse": 12,
      "title": "Jeremiah’s Prayer for Deliverance"
    },
    {
      "verse": 19,
      "title": "Restoring the Sabbath"
    }
  ],
  "jeremiah:18": [
    {
      "verse": 1,
      "title": "The Potter and the Clay"
    },
    {
      "verse": 18,
      "title": "Another Plot against Jeremiah"
    }
  ],
  "jeremiah:19": [
    {
      "verse": 1,
      "title": "The Broken Jar"
    }
  ],
  "jeremiah:20": [
    {
      "verse": 1,
      "title": "Pashhur Persecutes Jeremiah"
    },
    {
      "verse": 7,
      "title": "Jeremiah’s Complaint"
    }
  ],
  "jeremiah:21": [
    {
      "verse": 1,
      "title": "Jerusalem Will Fall to Babylon"
    },
    {
      "verse": 11,
      "title": "A Message to the House of David"
    }
  ],
  "jeremiah:22": [
    {
      "verse": 1,
      "title": "A Warning to Judah’s Kings"
    },
    {
      "verse": 6,
      "title": "A Warning about the Palace"
    },
    {
      "verse": 10,
      "title": "A Warning about Shallum"
    },
    {
      "verse": 13,
      "title": "A Warning about Jehoiakim"
    },
    {
      "verse": 24,
      "title": "A Warning to Coniah"
    }
  ],
  "jeremiah:23": [
    {
      "verse": 1,
      "title": "David’s Righteous Branch"
    },
    {
      "verse": 9,
      "title": "Lying Prophets"
    },
    {
      "verse": 33,
      "title": "False Prophecies"
    }
  ],
  "jeremiah:24": [
    {
      "verse": 1,
      "title": "The Good and Bad Figs"
    }
  ],
  "jeremiah:25": [
    {
      "verse": 1,
      "title": "Seventy Years of Captivity"
    },
    {
      "verse": 15,
      "title": "The Cup of God’s Wrath"
    },
    {
      "verse": 34,
      "title": "The Cry of the Shepherds"
    }
  ],
  "jeremiah:26": [
    {
      "verse": 1,
      "title": "A Warning to the Cities of Judah"
    },
    {
      "verse": 7,
      "title": "Jeremiah Threatened with Death"
    },
    {
      "verse": 16,
      "title": "Jeremiah Spared from Death"
    },
    {
      "verse": 20,
      "title": "The Prophet Uriah"
    }
  ],
  "jeremiah:27": [
    {
      "verse": 1,
      "title": "The Yoke of Nebuchadnezzar"
    }
  ],
  "jeremiah:28": [
    {
      "verse": 1,
      "title": "Hananiah’s False Prophecy"
    }
  ],
  "jeremiah:29": [
    {
      "verse": 1,
      "title": "Jeremiah’s Letter to the Exiles"
    },
    {
      "verse": 24,
      "title": "The Message to Shemaiah"
    }
  ],
  "jeremiah:30": [
    {
      "verse": 1,
      "title": "The Restoration of Israel and Judah"
    }
  ],
  "jeremiah:31": [
    {
      "verse": 1,
      "title": "Mourning Turned to Joy"
    },
    {
      "verse": 26,
      "title": "The New Covenant"
    }
  ],
  "jeremiah:32": [
    {
      "verse": 1,
      "title": "Jeremiah Buys Hanamel’s Field"
    },
    {
      "verse": 16,
      "title": "Jeremiah Prays for Understanding"
    },
    {
      "verse": 26,
      "title": "The LORD Answers Jeremiah"
    },
    {
      "verse": 36,
      "title": "A Promise of Restoration"
    }
  ],
  "jeremiah:33": [
    {
      "verse": 1,
      "title": "The Excellence of the Restored Nation"
    },
    {
      "verse": 14,
      "title": "The Covenant with David"
    }
  ],
  "jeremiah:34": [
    {
      "verse": 1,
      "title": "A Prophecy against Zedekiah"
    },
    {
      "verse": 8,
      "title": "Freedom for Hebrew Slaves"
    }
  ],
  "jeremiah:35": [
    {
      "verse": 1,
      "title": "The Obedience of the Rechabites"
    },
    {
      "verse": 12,
      "title": "Judah Rebuked"
    }
  ],
  "jeremiah:36": [
    {
      "verse": 1,
      "title": "Jeremiah’s Scroll Read in the Temple"
    },
    {
      "verse": 11,
      "title": "Jeremiah’s Scroll Read in the Palace"
    },
    {
      "verse": 20,
      "title": "Jehoiakim Burns the Scroll"
    },
    {
      "verse": 27,
      "title": "Jeremiah Rewrites the Scroll"
    }
  ],
  "jeremiah:37": [
    {
      "verse": 1,
      "title": "Jeremiah Warns Zedekiah"
    },
    {
      "verse": 11,
      "title": "Jeremiah Imprisoned"
    }
  ],
  "jeremiah:38": [
    {
      "verse": 1,
      "title": "Jeremiah Cast into the Cistern"
    }
  ],
  "jeremiah:39": [
    {
      "verse": 1,
      "title": "The Fall of Jerusalem"
    },
    {
      "verse": 11,
      "title": "Jeremiah Delivered"
    }
  ],
  "jeremiah:40": [
    {
      "verse": 1,
      "title": "Jeremiah Remains in Judah"
    },
    {
      "verse": 7,
      "title": "Gedaliah Governs in Judah"
    },
    {
      "verse": 13,
      "title": "The Plot against Gedaliah"
    }
  ],
  "jeremiah:41": [
    {
      "verse": 1,
      "title": "The Murder of Gedaliah"
    },
    {
      "verse": 11,
      "title": "Johanan Rescues the Captives"
    }
  ],
  "jeremiah:42": [
    {
      "verse": 1,
      "title": "A Warning against Going to Egypt"
    }
  ],
  "jeremiah:43": [
    {
      "verse": 1,
      "title": "Jeremiah Taken to Egypt"
    }
  ],
  "jeremiah:44": [
    {
      "verse": 1,
      "title": "Judgment on the Jews in Egypt"
    },
    {
      "verse": 15,
      "title": "The Stubbornness of the People"
    },
    {
      "verse": 20,
      "title": "Calamity for the Jews"
    }
  ],
  "jeremiah:45": [
    {
      "verse": 1,
      "title": "Jeremiah’s Message to Baruch"
    }
  ],
  "jeremiah:46": [
    {
      "verse": 1,
      "title": "Judgment on Egypt"
    }
  ],
  "jeremiah:47": [
    {
      "verse": 1,
      "title": "Judgment on the Philistines"
    }
  ],
  "jeremiah:48": [
    {
      "verse": 1,
      "title": "Judgment on Moab"
    }
  ],
  "jeremiah:49": [
    {
      "verse": 1,
      "title": "Judgment on the Ammonites"
    },
    {
      "verse": 7,
      "title": "Judgment on Edom"
    },
    {
      "verse": 23,
      "title": "Judgment on Damascus"
    },
    {
      "verse": 28,
      "title": "Judgment on Kedar and Hazor"
    },
    {
      "verse": 34,
      "title": "Judgment on Elam"
    }
  ],
  "jeremiah:50": [
    {
      "verse": 1,
      "title": "A Prophecy against Babylon"
    },
    {
      "verse": 4,
      "title": "Hope for Israel and Judah"
    },
    {
      "verse": 11,
      "title": "Babylon’s Fall Is Certain"
    },
    {
      "verse": 17,
      "title": "Redemption for God’s People"
    },
    {
      "verse": 21,
      "title": "The Destruction of Babylon"
    }
  ],
  "jeremiah:51": [
    {
      "verse": 1,
      "title": "Judgment on Babylon"
    },
    {
      "verse": 15,
      "title": "Praise to the God of Jacob"
    },
    {
      "verse": 20,
      "title": "Babylon’s Punishment"
    },
    {
      "verse": 59,
      "title": "Jeremiah’s Message to Seraiah"
    }
  ],
  "jeremiah:52": [
    {
      "verse": 1,
      "title": "The Fall of Jerusalem Recounted"
    },
    {
      "verse": 12,
      "title": "The Temple Destroyed"
    },
    {
      "verse": 24,
      "title": "Captives Carried to Babylon"
    },
    {
      "verse": 31,
      "title": "Jehoiachin Released from Prison"
    }
  ],
  "lamentations:1": [
    {
      "verse": 1,
      "title": "How Lonely Lies the City!"
    }
  ],
  "lamentations:2": [
    {
      "verse": 1,
      "title": "God’s Anger over Jerusalem"
    }
  ],
  "lamentations:3": [
    {
      "verse": 1,
      "title": "The Prophet’s Afflictions"
    },
    {
      "verse": 19,
      "title": "The Prophet’s Hope"
    },
    {
      "verse": 37,
      "title": "God’s Justice"
    }
  ],
  "lamentations:4": [
    {
      "verse": 1,
      "title": "The Distress of Zion"
    }
  ],
  "lamentations:5": [
    {
      "verse": 1,
      "title": "A Prayer for Restoration"
    }
  ],
  "ezekiel:1": [
    {
      "verse": 1,
      "title": "Ezekiel’s Vision by the River Kebar"
    },
    {
      "verse": 4,
      "title": "The Four Living Creatures"
    },
    {
      "verse": 15,
      "title": "The Four Wheels"
    },
    {
      "verse": 22,
      "title": "The Divine Glory"
    }
  ],
  "ezekiel:2": [
    {
      "verse": 1,
      "title": "Ezekiel’s Call"
    }
  ],
  "ezekiel:3": [
    {
      "verse": 1,
      "title": "Ezekiel Eats the Scroll"
    },
    {
      "verse": 16,
      "title": "A Watchman for Israel"
    }
  ],
  "ezekiel:4": [
    {
      "verse": 1,
      "title": "A Sign of Jerusalem’s Siege"
    },
    {
      "verse": 9,
      "title": "The Defiled Bread"
    }
  ],
  "ezekiel:5": [
    {
      "verse": 1,
      "title": "The Razor of Judgment"
    },
    {
      "verse": 11,
      "title": "Famine, Sword, and Dispersion"
    }
  ],
  "ezekiel:6": [
    {
      "verse": 1,
      "title": "Judgment against Idolatry"
    },
    {
      "verse": 8,
      "title": "A Remnant to Be Blessed"
    }
  ],
  "ezekiel:7": [
    {
      "verse": 1,
      "title": "The Hour of Doom"
    },
    {
      "verse": 14,
      "title": "The Desolation of Israel"
    }
  ],
  "ezekiel:8": [
    {
      "verse": 1,
      "title": "The Vision of Idolatry in the Temple"
    }
  ],
  "ezekiel:9": [
    {
      "verse": 1,
      "title": "Execution of the Idolaters"
    }
  ],
  "ezekiel:10": [
    {
      "verse": 1,
      "title": "God’s Glory Exits the Temple"
    }
  ],
  "ezekiel:11": [
    {
      "verse": 1,
      "title": "Evil in High Places"
    },
    {
      "verse": 13,
      "title": "A Promise of Restoration"
    },
    {
      "verse": 22,
      "title": "God’s Glory Leaves Jerusalem"
    }
  ],
  "ezekiel:12": [
    {
      "verse": 1,
      "title": "Signs of the Coming Captivity"
    },
    {
      "verse": 21,
      "title": "The Presumptuous Proverb"
    }
  ],
  "ezekiel:13": [
    {
      "verse": 1,
      "title": "Reproof of False Prophets"
    },
    {
      "verse": 17,
      "title": "Reproof of False Prophetesses"
    }
  ],
  "ezekiel:14": [
    {
      "verse": 1,
      "title": "Idolatrous Elders Condemned"
    },
    {
      "verse": 12,
      "title": "Four Dire Judgments"
    }
  ],
  "ezekiel:15": [
    {
      "verse": 1,
      "title": "Jerusalem the Useless Vine"
    }
  ],
  "ezekiel:16": [
    {
      "verse": 1,
      "title": "Jerusalem’s Unfaithfulness"
    },
    {
      "verse": 35,
      "title": "Judgment on Jerusalem"
    },
    {
      "verse": 59,
      "title": "The Covenant Remembered"
    }
  ],
  "ezekiel:17": [
    {
      "verse": 1,
      "title": "The Parable of Two Eagles and a Vine"
    },
    {
      "verse": 11,
      "title": "The Parable Explained"
    }
  ],
  "ezekiel:18": [
    {
      "verse": 1,
      "title": "The Soul Who Sins Will Die"
    }
  ],
  "ezekiel:19": [
    {
      "verse": 1,
      "title": "A Lament for the Princes of Israel"
    }
  ],
  "ezekiel:20": [
    {
      "verse": 1,
      "title": "Israel’s Rebellion in Egypt"
    },
    {
      "verse": 10,
      "title": "Israel’s Rebellion in the Wilderness"
    },
    {
      "verse": 27,
      "title": "Israel’s Rebellion in the Land"
    },
    {
      "verse": 33,
      "title": "Judgment and Restoration"
    },
    {
      "verse": 45,
      "title": "A Prophecy against the South"
    }
  ],
  "ezekiel:21": [
    {
      "verse": 1,
      "title": "God’s Sword of Judgment"
    }
  ],
  "ezekiel:22": [
    {
      "verse": 1,
      "title": "The Sins of Jerusalem"
    },
    {
      "verse": 17,
      "title": "The Refining Furnace"
    },
    {
      "verse": 23,
      "title": "Israel’s Wicked Leaders"
    }
  ],
  "ezekiel:23": [
    {
      "verse": 1,
      "title": "The Two Adulterous Sisters"
    },
    {
      "verse": 22,
      "title": "Oholibah to Be Plagued"
    },
    {
      "verse": 36,
      "title": "Judgment on Both Sisters"
    }
  ],
  "ezekiel:24": [
    {
      "verse": 1,
      "title": "The Parable of the Cooking Pot"
    },
    {
      "verse": 15,
      "title": "Ezekiel’s Wife Dies"
    }
  ],
  "ezekiel:25": [
    {
      "verse": 1,
      "title": "A Prophecy against Ammon"
    },
    {
      "verse": 8,
      "title": "A Prophecy against Moab"
    },
    {
      "verse": 12,
      "title": "A Prophecy against Edom"
    },
    {
      "verse": 15,
      "title": "A Prophecy against the Philistines"
    }
  ],
  "ezekiel:26": [
    {
      "verse": 1,
      "title": "A Prophecy against Tyre"
    }
  ],
  "ezekiel:27": [
    {
      "verse": 1,
      "title": "A Lament for Tyre"
    }
  ],
  "ezekiel:28": [
    {
      "verse": 1,
      "title": "A Prophecy against the Ruler of Tyre"
    },
    {
      "verse": 11,
      "title": "A Lament for the King of Tyre"
    },
    {
      "verse": 20,
      "title": "A Prophecy against Sidon"
    },
    {
      "verse": 25,
      "title": "The Restoration of Israel"
    }
  ],
  "ezekiel:29": [
    {
      "verse": 1,
      "title": "A Prophecy against Pharaoh"
    },
    {
      "verse": 8,
      "title": "The Desolation of Egypt"
    },
    {
      "verse": 17,
      "title": "Egypt the Reward of Nebuchadnezzar"
    }
  ],
  "ezekiel:30": [
    {
      "verse": 1,
      "title": "A Lament for Egypt"
    },
    {
      "verse": 20,
      "title": "Pharaoh’s Power Broken"
    }
  ],
  "ezekiel:31": [
    {
      "verse": 1,
      "title": "Egypt Will Fall like Assyria"
    }
  ],
  "ezekiel:32": [
    {
      "verse": 1,
      "title": "A Lament for Pharaoh King of Egypt"
    },
    {
      "verse": 17,
      "title": "Egypt Cast into the Pit"
    }
  ],
  "ezekiel:33": [
    {
      "verse": 1,
      "title": "Ezekiel the Watchman for Israel"
    },
    {
      "verse": 10,
      "title": "The Message of the Watchman"
    },
    {
      "verse": 21,
      "title": "Word of Jerusalem’s Fall"
    }
  ],
  "ezekiel:34": [
    {
      "verse": 1,
      "title": "A Prophecy against Israel’s Shepherds"
    },
    {
      "verse": 11,
      "title": "The Good Shepherd"
    },
    {
      "verse": 25,
      "title": "The Covenant of Peace"
    }
  ],
  "ezekiel:35": [
    {
      "verse": 1,
      "title": "A Prophecy against Mount Seir"
    }
  ],
  "ezekiel:36": [
    {
      "verse": 1,
      "title": "A Prophecy to the Mountains of Israel"
    },
    {
      "verse": 16,
      "title": "A New Heart and a New Spirit"
    }
  ],
  "ezekiel:37": [
    {
      "verse": 1,
      "title": "The Valley of Dry Bones"
    },
    {
      "verse": 15,
      "title": "One Nation with One King"
    }
  ],
  "ezekiel:38": [
    {
      "verse": 1,
      "title": "A Prophecy against Gog"
    }
  ],
  "ezekiel:39": [
    {
      "verse": 1,
      "title": "The Slaughter of Gog’s Armies"
    },
    {
      "verse": 21,
      "title": "Israel to Be Restored"
    }
  ],
  "ezekiel:40": [
    {
      "verse": 1,
      "title": "The Man with a Measuring Rod"
    },
    {
      "verse": 5,
      "title": "The East Gate"
    },
    {
      "verse": 17,
      "title": "The Outer Court"
    },
    {
      "verse": 20,
      "title": "The North Gate"
    },
    {
      "verse": 24,
      "title": "The South Gate"
    },
    {
      "verse": 28,
      "title": "The Gates of the Inner Court"
    },
    {
      "verse": 38,
      "title": "Eight Tables for Sacrifices"
    },
    {
      "verse": 44,
      "title": "Chambers for Ministry"
    },
    {
      "verse": 47,
      "title": "The Inner Court"
    }
  ],
  "ezekiel:41": [
    {
      "verse": 1,
      "title": "Inside the Temple"
    },
    {
      "verse": 5,
      "title": "Outside the Temple"
    },
    {
      "verse": 15,
      "title": "The Interior Structures"
    }
  ],
  "ezekiel:42": [
    {
      "verse": 1,
      "title": "Chambers for the Priests"
    },
    {
      "verse": 15,
      "title": "The Outer Measurements"
    }
  ],
  "ezekiel:43": [
    {
      "verse": 1,
      "title": "The Glory of the LORD Returns to the Temple"
    },
    {
      "verse": 13,
      "title": "The Altar of Sacrifice"
    }
  ],
  "ezekiel:44": [
    {
      "verse": 1,
      "title": "The East Gate Assigned to the Prince"
    },
    {
      "verse": 6,
      "title": "Reproof of the Levites"
    },
    {
      "verse": 15,
      "title": "The Duties of the Priests"
    }
  ],
  "ezekiel:45": [
    {
      "verse": 1,
      "title": "Consecration of the Land"
    },
    {
      "verse": 7,
      "title": "The Prince’s Portion"
    },
    {
      "verse": 10,
      "title": "Honest Scales"
    },
    {
      "verse": 13,
      "title": "Offerings and Feasts"
    }
  ],
  "ezekiel:46": [
    {
      "verse": 1,
      "title": "The Prince’s Offerings"
    },
    {
      "verse": 19,
      "title": "The Courts for Boiling and Baking"
    }
  ],
  "ezekiel:47": [
    {
      "verse": 1,
      "title": "Waters from under the Temple"
    },
    {
      "verse": 13,
      "title": "The Borders of the Land"
    }
  ],
  "ezekiel:48": [
    {
      "verse": 1,
      "title": "The Portions for the Tribes"
    },
    {
      "verse": 8,
      "title": "The Portions for the Priests and Levites"
    },
    {
      "verse": 15,
      "title": "The Common Portion"
    },
    {
      "verse": 21,
      "title": "The Portion for the Prince"
    },
    {
      "verse": 23,
      "title": "The Portions for the Remaining Tribes"
    },
    {
      "verse": 30,
      "title": "The City Gates and Dimensions"
    }
  ],
  "daniel:1": [
    {
      "verse": 1,
      "title": "Daniel Removed to Babylon"
    },
    {
      "verse": 8,
      "title": "Daniel’s Faithfulness"
    },
    {
      "verse": 17,
      "title": "Daniel’s Wisdom"
    }
  ],
  "daniel:2": [
    {
      "verse": 1,
      "title": "Nebuchadnezzar’s Troubling Dream"
    },
    {
      "verse": 14,
      "title": "The Dream Revealed to Daniel"
    },
    {
      "verse": 24,
      "title": "Daniel Interprets the Dream"
    },
    {
      "verse": 46,
      "title": "Nebuchadnezzar Promotes Daniel"
    }
  ],
  "daniel:3": [
    {
      "verse": 1,
      "title": "Nebuchadnezzar’s Golden Statue"
    },
    {
      "verse": 8,
      "title": "Shadrach, Meshach, and Abednego Accused"
    },
    {
      "verse": 19,
      "title": "The Fiery Furnace"
    }
  ],
  "daniel:4": [
    {
      "verse": 1,
      "title": "Nebuchadnezzar Confesses God’s Kingdom"
    },
    {
      "verse": 4,
      "title": "Nebuchadnezzar’s Dream of a Great Tree"
    },
    {
      "verse": 19,
      "title": "Daniel Interprets the Second Dream"
    },
    {
      "verse": 28,
      "title": "The Second Dream Fulfilled"
    },
    {
      "verse": 34,
      "title": "Nebuchadnezzar Restored"
    }
  ],
  "daniel:5": [
    {
      "verse": 1,
      "title": "Belshazzar’s Feast"
    },
    {
      "verse": 5,
      "title": "The Handwriting on the Wall"
    },
    {
      "verse": 13,
      "title": "Daniel Interprets the Handwriting"
    }
  ],
  "daniel:6": [
    {
      "verse": 1,
      "title": "The Plot against Daniel"
    },
    {
      "verse": 10,
      "title": "Daniel in the Lions’ Den"
    },
    {
      "verse": 25,
      "title": "Darius Honors God"
    }
  ],
  "daniel:7": [
    {
      "verse": 1,
      "title": "Daniel’s Vision of the Four Beasts"
    },
    {
      "verse": 9,
      "title": "Daniel’s Vision of the Ancient of Days"
    },
    {
      "verse": 13,
      "title": "Daniel’s Vision of the Son of Man"
    },
    {
      "verse": 15,
      "title": "Daniel’s Visions Interpreted"
    }
  ],
  "daniel:8": [
    {
      "verse": 1,
      "title": "Daniel’s Vision of the Ram and the Goat"
    },
    {
      "verse": 15,
      "title": "Gabriel Interprets Daniel’s Vision"
    }
  ],
  "daniel:9": [
    {
      "verse": 1,
      "title": "Daniel’s Prayer for His People"
    },
    {
      "verse": 20,
      "title": "Gabriel’s Prophecy of the Seventy Weeks"
    }
  ],
  "daniel:10": [
    {
      "verse": 1,
      "title": "Daniel’s Vision by the Tigris"
    }
  ],
  "daniel:11": [
    {
      "verse": 1,
      "title": "Kings of the South and North"
    },
    {
      "verse": 36,
      "title": "The King Who Exalts Himself"
    }
  ],
  "daniel:12": [
    {
      "verse": 1,
      "title": "The End Times"
    }
  ],
  "hosea:1": [
    {
      "verse": 1,
      "title": "Hosea’s Wife and Children"
    }
  ],
  "hosea:2": [
    {
      "verse": 1,
      "title": "Israel’s Adultery Rebuked"
    },
    {
      "verse": 14,
      "title": "God’s Mercy to Israel"
    }
  ],
  "hosea:3": [
    {
      "verse": 1,
      "title": "Hosea Redeems His Wife"
    }
  ],
  "hosea:4": [
    {
      "verse": 1,
      "title": "God’s Case against His People"
    }
  ],
  "hosea:5": [
    {
      "verse": 1,
      "title": "Judgment on Israel and Judah"
    }
  ],
  "hosea:6": [
    {
      "verse": 1,
      "title": "The Unrepentance of Israel and Judah"
    }
  ],
  "hosea:7": [
    {
      "verse": 1,
      "title": "Ephraim’s Iniquity"
    }
  ],
  "hosea:8": [
    {
      "verse": 1,
      "title": "Israel Will Reap the Whirlwind"
    }
  ],
  "hosea:9": [
    {
      "verse": 1,
      "title": "Israel’s Punishment"
    }
  ],
  "hosea:10": [
    {
      "verse": 1,
      "title": "Retribution for Israel’s Sin"
    }
  ],
  "hosea:11": [
    {
      "verse": 1,
      "title": "Out of Egypt I Called My Son"
    },
    {
      "verse": 8,
      "title": "God’s Love for Israel"
    }
  ],
  "hosea:12": [
    {
      "verse": 1,
      "title": "A Reproof of Ephraim, Judah, and Jacob"
    }
  ],
  "hosea:13": [
    {
      "verse": 1,
      "title": "God’s Anger against Israel"
    },
    {
      "verse": 9,
      "title": "Death and Resurrection"
    },
    {
      "verse": 15,
      "title": "Judgment on Samaria"
    }
  ],
  "hosea:14": [
    {
      "verse": 1,
      "title": "A Call to Repentance"
    },
    {
      "verse": 4,
      "title": "A Promise of God’s Blessing"
    }
  ],
  "joel:1": [
    {
      "verse": 1,
      "title": "The Invasion of Locusts"
    },
    {
      "verse": 8,
      "title": "A Call to Mourning"
    },
    {
      "verse": 13,
      "title": "A Call to Repentance"
    }
  ],
  "joel:2": [
    {
      "verse": 1,
      "title": "The Army of Locusts"
    },
    {
      "verse": 12,
      "title": "Return with All Your Heart"
    },
    {
      "verse": 18,
      "title": "Restoration Promised"
    },
    {
      "verse": 28,
      "title": "I Will Pour Out My Spirit"
    }
  ],
  "joel:3": [
    {
      "verse": 1,
      "title": "The LORD Judges the Nations"
    },
    {
      "verse": 17,
      "title": "Blessings for God’s People"
    }
  ],
  "amos:1": [
    {
      "verse": 1,
      "title": "Judgment on Israel’s Neighbors"
    }
  ],
  "amos:2": [
    {
      "verse": 1,
      "title": "Judgment on Moab, Judah, and Israel"
    }
  ],
  "amos:3": [
    {
      "verse": 1,
      "title": "Witnesses against Israel"
    }
  ],
  "amos:4": [
    {
      "verse": 1,
      "title": "Punishment Brings No Repentance"
    }
  ],
  "amos:5": [
    {
      "verse": 1,
      "title": "A Lamentation against Israel"
    },
    {
      "verse": 4,
      "title": "A Call to Repentance"
    },
    {
      "verse": 16,
      "title": "Woe to Rebellious Israel"
    }
  ],
  "amos:6": [
    {
      "verse": 1,
      "title": "Woe to Those at Ease in Zion"
    },
    {
      "verse": 8,
      "title": "The Pride of Israel"
    }
  ],
  "amos:7": [
    {
      "verse": 1,
      "title": "The Locusts, Fire, and Plumb Line"
    },
    {
      "verse": 10,
      "title": "Amaziah Accuses Amos"
    }
  ],
  "amos:8": [
    {
      "verse": 1,
      "title": "The Basket of Summer Fruit"
    }
  ],
  "amos:9": [
    {
      "verse": 1,
      "title": "The Destruction of Israel"
    },
    {
      "verse": 11,
      "title": "A Promise of Restoration"
    }
  ],
  "obadiah:1": [
    {
      "verse": 1,
      "title": "The Destruction of Edom"
    },
    {
      "verse": 15,
      "title": "The Deliverance of Israel"
    }
  ],
  "jonah:1": [
    {
      "verse": 1,
      "title": "Jonah Flees from the LORD"
    },
    {
      "verse": 4,
      "title": "The Great Storm"
    },
    {
      "verse": 11,
      "title": "Jonah Cast into the Sea"
    }
  ],
  "jonah:2": [
    {
      "verse": 1,
      "title": "Jonah’s Prayer"
    }
  ],
  "jonah:3": [
    {
      "verse": 1,
      "title": "The Ninevites Repent"
    }
  ],
  "jonah:4": [
    {
      "verse": 1,
      "title": "Jonah’s Anger at the LORD’s Compassion"
    }
  ],
  "micah:1": [
    {
      "verse": 1,
      "title": "Judgment to Come"
    },
    {
      "verse": 8,
      "title": "Weeping and Mourning"
    }
  ],
  "micah:2": [
    {
      "verse": 1,
      "title": "Woe to Oppressors"
    },
    {
      "verse": 6,
      "title": "Reproof of False Prophets"
    },
    {
      "verse": 12,
      "title": "The Remnant of Israel"
    }
  ],
  "micah:3": [
    {
      "verse": 1,
      "title": "Rulers and Prophets Condemned"
    }
  ],
  "micah:4": [
    {
      "verse": 1,
      "title": "The Mountain of the House of the LORD"
    },
    {
      "verse": 6,
      "title": "The Restoration of Zion"
    }
  ],
  "micah:5": [
    {
      "verse": 1,
      "title": "A Ruler from Bethlehem"
    },
    {
      "verse": 7,
      "title": "The Remnant of Jacob"
    }
  ],
  "micah:6": [
    {
      "verse": 1,
      "title": "The Case against Israel"
    },
    {
      "verse": 9,
      "title": "The Punishment of Israel"
    }
  ],
  "micah:7": [
    {
      "verse": 1,
      "title": "Israel’s Great Misery"
    },
    {
      "verse": 7,
      "title": "Israel’s Confession and Comfort"
    },
    {
      "verse": 14,
      "title": "God’s Compassion on Israel"
    }
  ],
  "nahum:1": [
    {
      "verse": 1,
      "title": "The Burden against Nineveh"
    }
  ],
  "nahum:2": [
    {
      "verse": 1,
      "title": "The Overthrow of Nineveh"
    }
  ],
  "nahum:3": [
    {
      "verse": 1,
      "title": "Judgment on Nineveh"
    }
  ],
  "habakkuk:1": [
    {
      "verse": 1,
      "title": "Habakkuk’s First Complaint"
    },
    {
      "verse": 5,
      "title": "The LORD’s Answer"
    },
    {
      "verse": 12,
      "title": "Habakkuk’s Second Complaint"
    }
  ],
  "habakkuk:2": [
    {
      "verse": 1,
      "title": "The LORD Answers Again"
    },
    {
      "verse": 6,
      "title": "Woe to the Chaldeans"
    }
  ],
  "habakkuk:3": [
    {
      "verse": 1,
      "title": "Habakkuk’s Prayer"
    },
    {
      "verse": 17,
      "title": "Habakkuk Rejoices"
    }
  ],
  "zephaniah:1": [
    {
      "verse": 1,
      "title": "Zephaniah Prophesies Judgment on Judah"
    },
    {
      "verse": 7,
      "title": "The Day of the LORD"
    }
  ],
  "zephaniah:2": [
    {
      "verse": 1,
      "title": "A Call to Repentance"
    },
    {
      "verse": 4,
      "title": "Judgment on the Philistines"
    },
    {
      "verse": 8,
      "title": "Judgment on Moab and Ammon"
    },
    {
      "verse": 12,
      "title": "Judgment on Cush and Assyria"
    }
  ],
  "zephaniah:3": [
    {
      "verse": 1,
      "title": "Judgment on Jerusalem"
    },
    {
      "verse": 6,
      "title": "Purification of the Nations"
    },
    {
      "verse": 9,
      "title": "A Faithful Remnant"
    },
    {
      "verse": 14,
      "title": "Israel’s Restoration"
    }
  ],
  "haggai:1": [
    {
      "verse": 1,
      "title": "A Call to Rebuild the Temple"
    },
    {
      "verse": 12,
      "title": "The People Obey"
    }
  ],
  "haggai:2": [
    {
      "verse": 1,
      "title": "The Coming Glory of God’s House"
    },
    {
      "verse": 10,
      "title": "Blessings for a Defiled People"
    },
    {
      "verse": 20,
      "title": "Zerubbabel the LORD’s Signet Ring"
    }
  ],
  "zechariah:1": [
    {
      "verse": 1,
      "title": "A Call to Repentance"
    },
    {
      "verse": 7,
      "title": "The Vision of the Horses"
    },
    {
      "verse": 18,
      "title": "The Vision of the Horns and the Craftsmen"
    }
  ],
  "zechariah:2": [
    {
      "verse": 1,
      "title": "The Vision of the Measuring Line"
    },
    {
      "verse": 6,
      "title": "The Redemption of Zion"
    }
  ],
  "zechariah:3": [
    {
      "verse": 1,
      "title": "The Vision of Joshua the High Priest"
    }
  ],
  "zechariah:4": [
    {
      "verse": 1,
      "title": "The Vision of the Lampstand and Olive Trees"
    }
  ],
  "zechariah:5": [
    {
      "verse": 1,
      "title": "The Vision of the Flying Scroll"
    },
    {
      "verse": 5,
      "title": "The Vision of the Woman in a Basket"
    }
  ],
  "zechariah:6": [
    {
      "verse": 1,
      "title": "The Vision of the Four Chariots"
    },
    {
      "verse": 9,
      "title": "The Crown and the Temple"
    }
  ],
  "zechariah:7": [
    {
      "verse": 1,
      "title": "A Call to Justice and Mercy"
    }
  ],
  "zechariah:8": [
    {
      "verse": 1,
      "title": "The Restoration of Jerusalem"
    }
  ],
  "zechariah:9": [
    {
      "verse": 1,
      "title": "The Burden against Israel’s Enemies"
    },
    {
      "verse": 9,
      "title": "Zion’s Coming King"
    },
    {
      "verse": 14,
      "title": "The LORD Will Save His People"
    }
  ],
  "zechariah:10": [
    {
      "verse": 1,
      "title": "Judah and Israel Will Be Restored"
    }
  ],
  "zechariah:11": [
    {
      "verse": 1,
      "title": "The Doomed Flock"
    },
    {
      "verse": 10,
      "title": "Thirty Pieces of Silver"
    }
  ],
  "zechariah:12": [
    {
      "verse": 1,
      "title": "The Coming Deliverance of Jerusalem"
    },
    {
      "verse": 10,
      "title": "Mourning the One They Pierced"
    }
  ],
  "zechariah:13": [
    {
      "verse": 1,
      "title": "An End to Idolatry"
    },
    {
      "verse": 7,
      "title": "The Shepherd Struck, the Sheep Scattered"
    }
  ],
  "zechariah:14": [
    {
      "verse": 1,
      "title": "The Destroyers of Jerusalem Destroyed"
    },
    {
      "verse": 16,
      "title": "All Nations Will Worship the King"
    }
  ],
  "malachi:1": [
    {
      "verse": 1,
      "title": "The LORD’s Love for Israel"
    },
    {
      "verse": 6,
      "title": "The Polluted Offerings"
    }
  ],
  "malachi:2": [
    {
      "verse": 1,
      "title": "A Warning to the Priests"
    },
    {
      "verse": 10,
      "title": "Judah’s Unfaithfulness"
    }
  ],
  "malachi:3": [
    {
      "verse": 1,
      "title": "I Will Send My Messenger"
    },
    {
      "verse": 6,
      "title": "Robbing God"
    },
    {
      "verse": 13,
      "title": "The Book of Remembrance"
    }
  ],
  "malachi:4": [
    {
      "verse": 1,
      "title": "The Day of the LORD"
    }
  ],
  "matthew:1": [
    {
      "verse": 1,
      "title": "The Genealogy of Jesus"
    },
    {
      "verse": 18,
      "title": "The Birth of Jesus"
    }
  ],
  "matthew:2": [
    {
      "verse": 1,
      "title": "The Pilgrimage of the Magi"
    },
    {
      "verse": 13,
      "title": "The Flight to Egypt"
    },
    {
      "verse": 16,
      "title": "Weeping and Great Mourning"
    },
    {
      "verse": 19,
      "title": "The Return to Nazareth"
    }
  ],
  "matthew:3": [
    {
      "verse": 1,
      "title": "The Mission of John the Baptist"
    },
    {
      "verse": 13,
      "title": "The Baptism of Jesus"
    }
  ],
  "matthew:4": [
    {
      "verse": 1,
      "title": "The Temptation of Jesus"
    },
    {
      "verse": 12,
      "title": "Jesus Begins His Ministry"
    },
    {
      "verse": 18,
      "title": "The First Disciples"
    },
    {
      "verse": 23,
      "title": "Jesus Heals the Multitudes"
    }
  ],
  "matthew:5": [
    {
      "verse": 1,
      "title": "The Sermon on the Mount"
    },
    {
      "verse": 3,
      "title": "The Beatitudes"
    },
    {
      "verse": 13,
      "title": "Salt and Light"
    },
    {
      "verse": 17,
      "title": "The Fulfillment of the Law"
    },
    {
      "verse": 21,
      "title": "Anger and Reconciliation"
    },
    {
      "verse": 27,
      "title": "Adultery"
    },
    {
      "verse": 31,
      "title": "Divorce"
    },
    {
      "verse": 33,
      "title": "Oaths and Vows"
    },
    {
      "verse": 38,
      "title": "Love Your Enemies"
    }
  ],
  "matthew:6": [
    {
      "verse": 1,
      "title": "Giving to the Needy"
    },
    {
      "verse": 5,
      "title": "The Lord’s Prayer"
    },
    {
      "verse": 16,
      "title": "Proper Fasting"
    },
    {
      "verse": 19,
      "title": "Treasures in Heaven"
    },
    {
      "verse": 22,
      "title": "The Lamp of the Body"
    },
    {
      "verse": 25,
      "title": "Do Not Worry"
    }
  ],
  "matthew:7": [
    {
      "verse": 1,
      "title": "Judging Others"
    },
    {
      "verse": 7,
      "title": "Ask, Seek, Knock"
    },
    {
      "verse": 13,
      "title": "The Narrow Gate"
    },
    {
      "verse": 15,
      "title": "A Tree and Its Fruit"
    },
    {
      "verse": 24,
      "title": "The House on the Rock"
    },
    {
      "verse": 28,
      "title": "The Authority of Jesus"
    }
  ],
  "matthew:8": [
    {
      "verse": 1,
      "title": "The Leper’s Prayer"
    },
    {
      "verse": 5,
      "title": "The Faith of the Centurion"
    },
    {
      "verse": 14,
      "title": "Jesus Heals at Peter’s House"
    },
    {
      "verse": 18,
      "title": "The Cost of Discipleship"
    },
    {
      "verse": 23,
      "title": "Jesus Calms the Storm"
    },
    {
      "verse": 28,
      "title": "The Demons and the Pigs"
    }
  ],
  "matthew:9": [
    {
      "verse": 1,
      "title": "Jesus Heals a Paralytic"
    },
    {
      "verse": 9,
      "title": "Jesus Calls Matthew"
    },
    {
      "verse": 14,
      "title": "Questions about Fasting"
    },
    {
      "verse": 16,
      "title": "The Patches and the Wineskins"
    },
    {
      "verse": 18,
      "title": "The Healing Touch of Jesus"
    },
    {
      "verse": 27,
      "title": "Jesus Heals the Blind and Mute"
    },
    {
      "verse": 35,
      "title": "The Lord of the Harvest"
    }
  ],
  "matthew:10": [
    {
      "verse": 1,
      "title": "The Twelve Apostles"
    },
    {
      "verse": 5,
      "title": "The Ministry of the Twelve"
    },
    {
      "verse": 16,
      "title": "Sheep among Wolves"
    },
    {
      "verse": 26,
      "title": "Fear God Alone"
    },
    {
      "verse": 32,
      "title": "Confessing Christ"
    },
    {
      "verse": 34,
      "title": "Not Peace but a Sword"
    },
    {
      "verse": 40,
      "title": "The Reward of Service"
    }
  ],
  "matthew:11": [
    {
      "verse": 1,
      "title": "John’s Inquiry"
    },
    {
      "verse": 7,
      "title": "Jesus Testifies about John"
    },
    {
      "verse": 20,
      "title": "Woe to the Unrepentant"
    },
    {
      "verse": 25,
      "title": "Rest for the Weary"
    }
  ],
  "matthew:12": [
    {
      "verse": 1,
      "title": "The Lord of the Sabbath"
    },
    {
      "verse": 9,
      "title": "Jesus Heals on the Sabbath"
    },
    {
      "verse": 15,
      "title": "God’s Chosen Servant"
    },
    {
      "verse": 22,
      "title": "A House Divided"
    },
    {
      "verse": 31,
      "title": "The Unpardonable Sin"
    },
    {
      "verse": 33,
      "title": "Good and Bad Fruit"
    },
    {
      "verse": 38,
      "title": "The Sign of Jonah"
    },
    {
      "verse": 43,
      "title": "An Unclean Spirit Returns"
    },
    {
      "verse": 46,
      "title": "Jesus’ Mother and Brothers"
    }
  ],
  "matthew:13": [
    {
      "verse": 1,
      "title": "The Parable of the Sower"
    },
    {
      "verse": 10,
      "title": "The Purpose of Jesus’ Parables"
    },
    {
      "verse": 18,
      "title": "The Parable of the Sower Explained"
    },
    {
      "verse": 24,
      "title": "The Parable of the Weeds"
    },
    {
      "verse": 31,
      "title": "The Parable of the Mustard Seed"
    },
    {
      "verse": 33,
      "title": "The Parable of the Leaven"
    },
    {
      "verse": 34,
      "title": "I Will Open My Mouth in Parables"
    },
    {
      "verse": 36,
      "title": "The Parable of the Weeds Explained"
    },
    {
      "verse": 44,
      "title": "The Parables of the Treasure and the Pearl"
    },
    {
      "verse": 47,
      "title": "The Parable of the Net"
    },
    {
      "verse": 53,
      "title": "The Rejection at Nazareth"
    }
  ],
  "matthew:14": [
    {
      "verse": 1,
      "title": "The Beheading of John"
    },
    {
      "verse": 13,
      "title": "The Feeding of the Five Thousand"
    },
    {
      "verse": 22,
      "title": "Jesus Walks on Water"
    },
    {
      "verse": 34,
      "title": "Jesus Heals at Gennesaret"
    }
  ],
  "matthew:15": [
    {
      "verse": 1,
      "title": "The Tradition of the Elders"
    },
    {
      "verse": 10,
      "title": "What Defiles a Man"
    },
    {
      "verse": 21,
      "title": "The Faith of the Canaanite Woman"
    },
    {
      "verse": 29,
      "title": "The Feeding of the Four Thousand"
    }
  ],
  "matthew:16": [
    {
      "verse": 1,
      "title": "The Demand for a Sign"
    },
    {
      "verse": 5,
      "title": "The Leaven of the Pharisees and Sadducees"
    },
    {
      "verse": 13,
      "title": "Peter’s Confession of Christ"
    },
    {
      "verse": 21,
      "title": "Christ’s Passion Foretold"
    },
    {
      "verse": 24,
      "title": "Take Up Your Cross"
    }
  ],
  "matthew:17": [
    {
      "verse": 1,
      "title": "The Transfiguration"
    },
    {
      "verse": 14,
      "title": "The Boy with a Demon"
    },
    {
      "verse": 19,
      "title": "The Power of Faith"
    },
    {
      "verse": 22,
      "title": "The Second Prediction of the Passion"
    },
    {
      "verse": 24,
      "title": "The Temple Tax"
    }
  ],
  "matthew:18": [
    {
      "verse": 1,
      "title": "The Greatest in the Kingdom"
    },
    {
      "verse": 6,
      "title": "Temptations and Trespasses"
    },
    {
      "verse": 10,
      "title": "The Parable of the Lost Sheep"
    },
    {
      "verse": 15,
      "title": "A Brother Who Sins"
    },
    {
      "verse": 19,
      "title": "Ask in My Name"
    },
    {
      "verse": 21,
      "title": "The Unforgiving Servant"
    }
  ],
  "matthew:19": [
    {
      "verse": 1,
      "title": "Teachings about Divorce"
    },
    {
      "verse": 13,
      "title": "Jesus Blesses the Children"
    },
    {
      "verse": 16,
      "title": "The Rich Young Man"
    }
  ],
  "matthew:20": [
    {
      "verse": 1,
      "title": "The Parable of the Workers"
    },
    {
      "verse": 17,
      "title": "The Third Prediction of the Passion"
    },
    {
      "verse": 20,
      "title": "A Mother’s Request"
    },
    {
      "verse": 29,
      "title": "The Blind Men by the Road"
    }
  ],
  "matthew:21": [
    {
      "verse": 1,
      "title": "The Triumphal Entry"
    },
    {
      "verse": 12,
      "title": "Jesus Cleanses the Temple"
    },
    {
      "verse": 18,
      "title": "The Barren Fig Tree"
    },
    {
      "verse": 23,
      "title": "Jesus’ Authority Challenged"
    },
    {
      "verse": 28,
      "title": "The Parable of the Two Sons"
    },
    {
      "verse": 33,
      "title": "The Parable of the Wicked Tenants"
    }
  ],
  "matthew:22": [
    {
      "verse": 1,
      "title": "The Parable of the Banquet"
    },
    {
      "verse": 15,
      "title": "Paying Taxes to Caesar"
    },
    {
      "verse": 23,
      "title": "The Sadducees and the Resurrection"
    },
    {
      "verse": 34,
      "title": "The Greatest Commandment"
    },
    {
      "verse": 41,
      "title": "Whose Son Is the Christ?"
    }
  ],
  "matthew:23": [
    {
      "verse": 1,
      "title": "Woes to Scribes and Pharisees"
    },
    {
      "verse": 37,
      "title": "Lament over Jerusalem"
    }
  ],
  "matthew:24": [
    {
      "verse": 1,
      "title": "Temple Destruction and Other Signs"
    },
    {
      "verse": 9,
      "title": "Witnessing to All Nations"
    },
    {
      "verse": 15,
      "title": "The Abomination of Desolation"
    },
    {
      "verse": 26,
      "title": "The Return of the Son of Man"
    },
    {
      "verse": 32,
      "title": "The Lesson of the Fig Tree"
    },
    {
      "verse": 36,
      "title": "Readiness at Any Hour"
    }
  ],
  "matthew:25": [
    {
      "verse": 1,
      "title": "The Parable of the Ten Virgins"
    },
    {
      "verse": 14,
      "title": "The Parable of the Talents"
    },
    {
      "verse": 31,
      "title": "The Sheep and the Goats"
    }
  ],
  "matthew:26": [
    {
      "verse": 1,
      "title": "The Plot to Kill Jesus"
    },
    {
      "verse": 6,
      "title": "Jesus Anointed at Bethany"
    },
    {
      "verse": 14,
      "title": "Judas Agrees to Betray Jesus"
    },
    {
      "verse": 17,
      "title": "Preparing the Passover"
    },
    {
      "verse": 20,
      "title": "The Last Supper"
    },
    {
      "verse": 31,
      "title": "Jesus Predicts Peter’s Denial"
    },
    {
      "verse": 36,
      "title": "Jesus Prays at Gethsemane"
    },
    {
      "verse": 47,
      "title": "The Betrayal of Jesus"
    },
    {
      "verse": 57,
      "title": "Jesus before the Sanhedrin"
    },
    {
      "verse": 69,
      "title": "Peter Denies Jesus"
    }
  ],
  "matthew:27": [
    {
      "verse": 1,
      "title": "Jesus Delivered to Pilate"
    },
    {
      "verse": 3,
      "title": "Judas Hangs Himself"
    },
    {
      "verse": 11,
      "title": "Jesus before Pilate"
    },
    {
      "verse": 15,
      "title": "The Crowd Chooses Barabbas"
    },
    {
      "verse": 24,
      "title": "Pilate Washes His Hands"
    },
    {
      "verse": 27,
      "title": "The Soldiers Mock Jesus"
    },
    {
      "verse": 32,
      "title": "The Crucifixion"
    },
    {
      "verse": 45,
      "title": "The Death of Jesus"
    },
    {
      "verse": 57,
      "title": "The Burial of Jesus"
    },
    {
      "verse": 62,
      "title": "The Guards at the Tomb"
    }
  ],
  "matthew:28": [
    {
      "verse": 1,
      "title": "The Resurrection"
    },
    {
      "verse": 11,
      "title": "The Report of the Guards"
    },
    {
      "verse": 16,
      "title": "The Great Commission"
    }
  ],
  "mark:1": [
    {
      "verse": 1,
      "title": "The Mission of John the Baptist"
    },
    {
      "verse": 12,
      "title": "The Temptation and Preaching of Jesus"
    },
    {
      "verse": 16,
      "title": "The First Disciples"
    },
    {
      "verse": 21,
      "title": "Jesus Expels an Unclean Spirit"
    },
    {
      "verse": 29,
      "title": "Jesus Heals at Peter’s House"
    },
    {
      "verse": 35,
      "title": "Jesus Prays and Preaches"
    },
    {
      "verse": 40,
      "title": "The Leper’s Prayer"
    }
  ],
  "mark:2": [
    {
      "verse": 1,
      "title": "Jesus Heals a Paralytic"
    },
    {
      "verse": 13,
      "title": "Jesus Calls Levi"
    },
    {
      "verse": 18,
      "title": "Questions about Fasting"
    },
    {
      "verse": 21,
      "title": "The Patches and the Wineskins"
    },
    {
      "verse": 23,
      "title": "The Lord of the Sabbath"
    }
  ],
  "mark:3": [
    {
      "verse": 1,
      "title": "Jesus Heals on the Sabbath"
    },
    {
      "verse": 7,
      "title": "Jesus Heals the Multitudes"
    },
    {
      "verse": 13,
      "title": "The Twelve Apostles"
    },
    {
      "verse": 20,
      "title": "A House Divided"
    },
    {
      "verse": 28,
      "title": "The Unpardonable Sin"
    },
    {
      "verse": 31,
      "title": "Jesus’ Mother and Brothers"
    }
  ],
  "mark:4": [
    {
      "verse": 1,
      "title": "The Parable of the Sower"
    },
    {
      "verse": 10,
      "title": "The Purpose of Jesus’ Parables"
    },
    {
      "verse": 13,
      "title": "The Parable of the Sower Explained"
    },
    {
      "verse": 21,
      "title": "The Lesson of the Lamp"
    },
    {
      "verse": 26,
      "title": "The Seed Growing Secretly"
    },
    {
      "verse": 30,
      "title": "The Parable of the Mustard Seed"
    },
    {
      "verse": 35,
      "title": "Jesus Calms the Storm"
    }
  ],
  "mark:5": [
    {
      "verse": 1,
      "title": "The Demons and the Pigs"
    },
    {
      "verse": 21,
      "title": "The Healing Touch of Jesus"
    }
  ],
  "mark:6": [
    {
      "verse": 1,
      "title": "The Rejection at Nazareth"
    },
    {
      "verse": 7,
      "title": "The Ministry of the Twelve"
    },
    {
      "verse": 14,
      "title": "The Beheading of John"
    },
    {
      "verse": 30,
      "title": "The Feeding of the Five Thousand"
    },
    {
      "verse": 45,
      "title": "Jesus Walks on Water"
    },
    {
      "verse": 53,
      "title": "Jesus Heals at Gennesaret"
    }
  ],
  "mark:7": [
    {
      "verse": 1,
      "title": "The Tradition of the Elders"
    },
    {
      "verse": 14,
      "title": "What Defiles a Man"
    },
    {
      "verse": 24,
      "title": "The Faith of the Gentile Woman"
    },
    {
      "verse": 31,
      "title": "The Deaf and Mute Man"
    }
  ],
  "mark:8": [
    {
      "verse": 1,
      "title": "The Feeding of the Four Thousand"
    },
    {
      "verse": 11,
      "title": "The Demand for a Sign"
    },
    {
      "verse": 14,
      "title": "The Leaven of the Pharisees and of Herod"
    },
    {
      "verse": 22,
      "title": "The Blind Man at Bethsaida"
    },
    {
      "verse": 27,
      "title": "Peter’s Confession of Christ"
    },
    {
      "verse": 31,
      "title": "Christ’s Passion Foretold"
    },
    {
      "verse": 34,
      "title": "Take Up Your Cross"
    }
  ],
  "mark:9": [
    {
      "verse": 1,
      "title": "The Transfiguration"
    },
    {
      "verse": 14,
      "title": "The Boy with an Evil Spirit"
    },
    {
      "verse": 30,
      "title": "The Second Prediction of the Passion"
    },
    {
      "verse": 33,
      "title": "The Greatest in the Kingdom"
    },
    {
      "verse": 42,
      "title": "Temptations and Trespasses"
    },
    {
      "verse": 49,
      "title": "Good Salt"
    }
  ],
  "mark:10": [
    {
      "verse": 1,
      "title": "Teachings about Divorce"
    },
    {
      "verse": 13,
      "title": "Jesus Blesses the Children"
    },
    {
      "verse": 17,
      "title": "The Rich Young Man"
    },
    {
      "verse": 32,
      "title": "The Third Prediction of the Passion"
    },
    {
      "verse": 35,
      "title": "The Request of James and John"
    },
    {
      "verse": 46,
      "title": "Jesus Heals Bartimaeus"
    }
  ],
  "mark:11": [
    {
      "verse": 1,
      "title": "The Triumphal Entry"
    },
    {
      "verse": 12,
      "title": "Jesus Curses the Fig Tree"
    },
    {
      "verse": 15,
      "title": "Jesus Cleanses the Temple"
    },
    {
      "verse": 20,
      "title": "The Withered Fig Tree"
    },
    {
      "verse": 27,
      "title": "Jesus’ Authority Challenged"
    }
  ],
  "mark:12": [
    {
      "verse": 1,
      "title": "The Parable of the Wicked Tenants"
    },
    {
      "verse": 13,
      "title": "Paying Taxes to Caesar"
    },
    {
      "verse": 18,
      "title": "The Sadducees and the Resurrection"
    },
    {
      "verse": 28,
      "title": "The Greatest Commandment"
    },
    {
      "verse": 35,
      "title": "Whose Son Is the Christ?"
    },
    {
      "verse": 38,
      "title": "Beware of the Scribes"
    },
    {
      "verse": 41,
      "title": "The Widow’s Offering"
    }
  ],
  "mark:13": [
    {
      "verse": 1,
      "title": "Temple Destruction and Other Signs"
    },
    {
      "verse": 9,
      "title": "Witnessing to All Nations"
    },
    {
      "verse": 14,
      "title": "The Abomination of Desolation"
    },
    {
      "verse": 24,
      "title": "The Return of the Son of Man"
    },
    {
      "verse": 28,
      "title": "The Lesson of the Fig Tree"
    },
    {
      "verse": 32,
      "title": "Readiness at Any Hour"
    }
  ],
  "mark:14": [
    {
      "verse": 1,
      "title": "The Plot to Kill Jesus"
    },
    {
      "verse": 3,
      "title": "Jesus Anointed at Bethany"
    },
    {
      "verse": 10,
      "title": "Judas Agrees to Betray Jesus"
    },
    {
      "verse": 12,
      "title": "Preparing the Passover"
    },
    {
      "verse": 17,
      "title": "The Last Supper"
    },
    {
      "verse": 27,
      "title": "Jesus Predicts Peter’s Denial"
    },
    {
      "verse": 32,
      "title": "Jesus Prays at Gethsemane"
    },
    {
      "verse": 43,
      "title": "The Betrayal of Jesus"
    },
    {
      "verse": 53,
      "title": "Jesus before the Sanhedrin"
    },
    {
      "verse": 66,
      "title": "Peter Denies Jesus"
    }
  ],
  "mark:15": [
    {
      "verse": 1,
      "title": "Jesus Delivered to Pilate"
    },
    {
      "verse": 6,
      "title": "The Crowd Chooses Barabbas"
    },
    {
      "verse": 12,
      "title": "Pilate Delivers Up Jesus"
    },
    {
      "verse": 16,
      "title": "The Soldiers Mock Jesus"
    },
    {
      "verse": 21,
      "title": "The Crucifixion"
    },
    {
      "verse": 33,
      "title": "The Death of Jesus"
    },
    {
      "verse": 42,
      "title": "The Burial of Jesus"
    }
  ],
  "mark:16": [
    {
      "verse": 1,
      "title": "The Resurrection"
    },
    {
      "verse": 9,
      "title": "Jesus Appears to Mary Magdalene"
    },
    {
      "verse": 12,
      "title": "Jesus Appears to Two Disciples"
    },
    {
      "verse": 14,
      "title": "The Great Commission"
    },
    {
      "verse": 19,
      "title": "The Ascension"
    }
  ],
  "luke:1": [
    {
      "verse": 1,
      "title": "Dedication to Theophilus"
    },
    {
      "verse": 5,
      "title": "Gabriel Foretells John’s Birth"
    },
    {
      "verse": 26,
      "title": "Gabriel Foretells Jesus’ Birth"
    },
    {
      "verse": 39,
      "title": "Mary Visits Elizabeth"
    },
    {
      "verse": 46,
      "title": "Mary’s Song"
    },
    {
      "verse": 57,
      "title": "The Birth of John the Baptist"
    },
    {
      "verse": 67,
      "title": "Zechariah’s Song"
    }
  ],
  "luke:2": [
    {
      "verse": 1,
      "title": "The Birth of Jesus"
    },
    {
      "verse": 8,
      "title": "The Shepherds and the Angels"
    },
    {
      "verse": 21,
      "title": "Jesus Presented at the Temple"
    },
    {
      "verse": 25,
      "title": "The Prophecy of Simeon"
    },
    {
      "verse": 36,
      "title": "The Prophecy of Anna"
    },
    {
      "verse": 39,
      "title": "The Return to Nazareth"
    },
    {
      "verse": 41,
      "title": "The Boy Jesus at the Temple"
    }
  ],
  "luke:3": [
    {
      "verse": 1,
      "title": "The Mission of John the Baptist"
    },
    {
      "verse": 21,
      "title": "The Baptism of Jesus"
    },
    {
      "verse": 23,
      "title": "The Genealogy of Jesus"
    }
  ],
  "luke:4": [
    {
      "verse": 1,
      "title": "The Temptation of Jesus"
    },
    {
      "verse": 14,
      "title": "Jesus Begins His Ministry"
    },
    {
      "verse": 16,
      "title": "The Rejection at Nazareth"
    },
    {
      "verse": 31,
      "title": "Jesus Expels an Unclean Spirit"
    },
    {
      "verse": 38,
      "title": "Jesus Heals at Peter’s House"
    },
    {
      "verse": 42,
      "title": "Jesus Preaches in Judea"
    }
  ],
  "luke:5": [
    {
      "verse": 1,
      "title": "The First Disciples"
    },
    {
      "verse": 12,
      "title": "The Leper’s Prayer"
    },
    {
      "verse": 17,
      "title": "Jesus Heals a Paralytic"
    },
    {
      "verse": 27,
      "title": "Jesus Calls Levi"
    },
    {
      "verse": 33,
      "title": "Questions about Fasting"
    },
    {
      "verse": 36,
      "title": "The Patches and the Wineskins"
    }
  ],
  "luke:6": [
    {
      "verse": 1,
      "title": "The Lord of the Sabbath"
    },
    {
      "verse": 6,
      "title": "Jesus Heals on the Sabbath"
    },
    {
      "verse": 12,
      "title": "The Twelve Apostles"
    },
    {
      "verse": 17,
      "title": "Jesus Heals the Multitudes"
    },
    {
      "verse": 20,
      "title": "The Beatitudes"
    },
    {
      "verse": 24,
      "title": "Woes to the Satisfied"
    },
    {
      "verse": 27,
      "title": "Love Your Enemies"
    },
    {
      "verse": 37,
      "title": "Judging Others"
    },
    {
      "verse": 43,
      "title": "A Tree and Its Fruit"
    },
    {
      "verse": 46,
      "title": "The House on the Rock"
    }
  ],
  "luke:7": [
    {
      "verse": 1,
      "title": "The Faith of the Centurion"
    },
    {
      "verse": 11,
      "title": "Jesus Raises a Widow’s Son"
    },
    {
      "verse": 18,
      "title": "John’s Inquiry"
    },
    {
      "verse": 24,
      "title": "Jesus Testifies about John"
    },
    {
      "verse": 36,
      "title": "A Sinful Woman Anoints Jesus"
    }
  ],
  "luke:8": [
    {
      "verse": 1,
      "title": "Women Minister to Jesus"
    },
    {
      "verse": 4,
      "title": "The Parable of the Sower"
    },
    {
      "verse": 16,
      "title": "The Lesson of the Lamp"
    },
    {
      "verse": 19,
      "title": "Jesus’ Mother and Brothers"
    },
    {
      "verse": 22,
      "title": "Jesus Calms the Storm"
    },
    {
      "verse": 26,
      "title": "The Demons and the Pigs"
    },
    {
      "verse": 40,
      "title": "The Healing Touch of Jesus"
    }
  ],
  "luke:9": [
    {
      "verse": 1,
      "title": "The Ministry of the Twelve"
    },
    {
      "verse": 7,
      "title": "Herod Tries to See Jesus"
    },
    {
      "verse": 10,
      "title": "The Feeding of the Five Thousand"
    },
    {
      "verse": 18,
      "title": "Peter’s Confession of Christ"
    },
    {
      "verse": 21,
      "title": "Christ’s Passion Foretold"
    },
    {
      "verse": 23,
      "title": "Take Up Your Cross"
    },
    {
      "verse": 28,
      "title": "The Transfiguration"
    },
    {
      "verse": 37,
      "title": "The Boy with an Evil Spirit"
    },
    {
      "verse": 43,
      "title": "The Second Prediction of the Passion"
    },
    {
      "verse": 46,
      "title": "The Greatest in the Kingdom"
    },
    {
      "verse": 51,
      "title": "The Samaritans Reject Jesus"
    },
    {
      "verse": 57,
      "title": "The Cost of Discipleship"
    }
  ],
  "luke:10": [
    {
      "verse": 1,
      "title": "Jesus Sends the Seventy-Two"
    },
    {
      "verse": 13,
      "title": "Woe to the Unrepentant"
    },
    {
      "verse": 17,
      "title": "The Joyful Return"
    },
    {
      "verse": 21,
      "title": "Jesus’ Prayer of Thanksgiving"
    },
    {
      "verse": 25,
      "title": "The Parable of the Good Samaritan"
    },
    {
      "verse": 38,
      "title": "Martha and Mary"
    }
  ],
  "luke:11": [
    {
      "verse": 1,
      "title": "The Lord’s Prayer"
    },
    {
      "verse": 5,
      "title": "Ask, Seek, Knock"
    },
    {
      "verse": 14,
      "title": "A House Divided"
    },
    {
      "verse": 24,
      "title": "An Unclean Spirit Returns"
    },
    {
      "verse": 27,
      "title": "True Blessedness"
    },
    {
      "verse": 29,
      "title": "The Sign of Jonah"
    },
    {
      "verse": 33,
      "title": "The Lamp of the Body"
    },
    {
      "verse": 37,
      "title": "Woes to Pharisees and Experts in the Law"
    }
  ],
  "luke:12": [
    {
      "verse": 1,
      "title": "The Leaven of the Pharisees"
    },
    {
      "verse": 4,
      "title": "Fear God Alone"
    },
    {
      "verse": 8,
      "title": "Confessing Christ"
    },
    {
      "verse": 13,
      "title": "The Parable of the Rich Fool"
    },
    {
      "verse": 22,
      "title": "Do Not Worry"
    },
    {
      "verse": 32,
      "title": "Treasures in Heaven"
    },
    {
      "verse": 35,
      "title": "Readiness at Any Hour"
    },
    {
      "verse": 49,
      "title": "Not Peace but Division"
    },
    {
      "verse": 54,
      "title": "Interpreting the Present Time"
    },
    {
      "verse": 57,
      "title": "Reconciling with an Adversary"
    }
  ],
  "luke:13": [
    {
      "verse": 1,
      "title": "A Call to Repentance"
    },
    {
      "verse": 6,
      "title": "The Parable of the Barren Fig Tree"
    },
    {
      "verse": 10,
      "title": "Jesus Heals a Disabled Woman"
    },
    {
      "verse": 18,
      "title": "The Parable of the Mustard Seed"
    },
    {
      "verse": 20,
      "title": "The Parable of the Leaven"
    },
    {
      "verse": 22,
      "title": "The Narrow Door"
    },
    {
      "verse": 31,
      "title": "Lament over Jerusalem"
    }
  ],
  "luke:14": [
    {
      "verse": 1,
      "title": "Jesus Heals a Man with Dropsy"
    },
    {
      "verse": 7,
      "title": "The Parable of the Guests"
    },
    {
      "verse": 15,
      "title": "The Parable of the Banquet"
    },
    {
      "verse": 25,
      "title": "The Cost of Discipleship"
    },
    {
      "verse": 34,
      "title": "Good Salt"
    }
  ],
  "luke:15": [
    {
      "verse": 1,
      "title": "The Parable of the Lost Sheep"
    },
    {
      "verse": 8,
      "title": "The Parable of the Lost Coin"
    },
    {
      "verse": 11,
      "title": "The Parable of the Prodigal Son"
    }
  ],
  "luke:16": [
    {
      "verse": 1,
      "title": "The Parable of the Shrewd Manager"
    },
    {
      "verse": 14,
      "title": "The Law and the Prophets"
    },
    {
      "verse": 19,
      "title": "The Rich Man and Lazarus"
    }
  ],
  "luke:17": [
    {
      "verse": 1,
      "title": "Temptations and Trespasses"
    },
    {
      "verse": 5,
      "title": "The Power of Faith"
    },
    {
      "verse": 11,
      "title": "The Ten Lepers"
    },
    {
      "verse": 20,
      "title": "The Coming of the Kingdom"
    }
  ],
  "luke:18": [
    {
      "verse": 1,
      "title": "The Parable of the Persistent Widow"
    },
    {
      "verse": 9,
      "title": "The Pharisee and the Tax Collector"
    },
    {
      "verse": 15,
      "title": "Jesus Blesses the Children"
    },
    {
      "verse": 18,
      "title": "The Rich Young Ruler"
    },
    {
      "verse": 31,
      "title": "The Third Prediction of the Passion"
    },
    {
      "verse": 35,
      "title": "Jesus Heals a Blind Beggar"
    }
  ],
  "luke:19": [
    {
      "verse": 1,
      "title": "Jesus and Zacchaeus"
    },
    {
      "verse": 11,
      "title": "The Parable of the Ten Minas"
    },
    {
      "verse": 28,
      "title": "The Triumphal Entry"
    },
    {
      "verse": 41,
      "title": "Jesus Weeps over Jerusalem"
    },
    {
      "verse": 45,
      "title": "Jesus Cleanses the Temple"
    }
  ],
  "luke:20": [
    {
      "verse": 1,
      "title": "Jesus’ Authority Challenged"
    },
    {
      "verse": 9,
      "title": "The Parable of the Wicked Tenants"
    },
    {
      "verse": 19,
      "title": "Paying Taxes to Caesar"
    },
    {
      "verse": 27,
      "title": "The Sadducees and the Resurrection"
    },
    {
      "verse": 41,
      "title": "Whose Son Is the Christ?"
    },
    {
      "verse": 45,
      "title": "Beware of the Scribes"
    }
  ],
  "luke:21": [
    {
      "verse": 1,
      "title": "The Poor Widow’s Offering"
    },
    {
      "verse": 5,
      "title": "Temple Destruction and Other Signs"
    },
    {
      "verse": 10,
      "title": "Witnessing to All Nations"
    },
    {
      "verse": 20,
      "title": "The Destruction of Jerusalem"
    },
    {
      "verse": 25,
      "title": "The Return of the Son of Man"
    },
    {
      "verse": 29,
      "title": "The Lesson of the Fig Tree"
    },
    {
      "verse": 34,
      "title": "Be Watchful for the Day"
    }
  ],
  "luke:22": [
    {
      "verse": 1,
      "title": "The Plot to Kill Jesus"
    },
    {
      "verse": 3,
      "title": "Judas Agrees to Betray Jesus"
    },
    {
      "verse": 7,
      "title": "Preparing the Passover"
    },
    {
      "verse": 14,
      "title": "The Last Supper"
    },
    {
      "verse": 24,
      "title": "Who Is the Greatest?"
    },
    {
      "verse": 31,
      "title": "Jesus Predicts Peter’s Denial"
    },
    {
      "verse": 39,
      "title": "Jesus Prays on the Mount of Olives"
    },
    {
      "verse": 47,
      "title": "The Betrayal of Jesus"
    },
    {
      "verse": 54,
      "title": "Peter Denies Jesus"
    },
    {
      "verse": 63,
      "title": "The Soldiers Mock Jesus"
    },
    {
      "verse": 66,
      "title": "Jesus before the Sanhedrin"
    }
  ],
  "luke:23": [
    {
      "verse": 1,
      "title": "Jesus before Pilate"
    },
    {
      "verse": 6,
      "title": "Jesus before Herod"
    },
    {
      "verse": 13,
      "title": "The Crowd Chooses Barabbas"
    },
    {
      "verse": 26,
      "title": "The Crucifixion"
    },
    {
      "verse": 44,
      "title": "The Death of Jesus"
    },
    {
      "verse": 50,
      "title": "The Burial of Jesus"
    }
  ],
  "luke:24": [
    {
      "verse": 1,
      "title": "The Resurrection"
    },
    {
      "verse": 13,
      "title": "The Road to Emmaus"
    },
    {
      "verse": 36,
      "title": "Jesus Appears to the Disciples"
    },
    {
      "verse": 50,
      "title": "The Ascension"
    }
  ],
  "john:1": [
    {
      "verse": 1,
      "title": "The Beginning"
    },
    {
      "verse": 6,
      "title": "The Witness of John"
    },
    {
      "verse": 14,
      "title": "The Word Became Flesh"
    },
    {
      "verse": 19,
      "title": "The Mission of John the Baptist"
    },
    {
      "verse": 29,
      "title": "Jesus the Lamb of God"
    },
    {
      "verse": 35,
      "title": "The First Disciples"
    },
    {
      "verse": 43,
      "title": "Jesus Calls Philip and Nathanael"
    }
  ],
  "john:2": [
    {
      "verse": 1,
      "title": "The Wedding at Cana"
    },
    {
      "verse": 12,
      "title": "Jesus Cleanses the Temple"
    }
  ],
  "john:3": [
    {
      "verse": 1,
      "title": "Jesus and Nicodemus"
    },
    {
      "verse": 22,
      "title": "John’s Testimony about Jesus"
    }
  ],
  "john:4": [
    {
      "verse": 1,
      "title": "Jesus and the Samaritan Woman"
    },
    {
      "verse": 27,
      "title": "The Disciples Return and Marvel"
    },
    {
      "verse": 39,
      "title": "Many Samaritans Believe"
    },
    {
      "verse": 43,
      "title": "Jesus Heals the Official’s Son"
    }
  ],
  "john:5": [
    {
      "verse": 1,
      "title": "The Pool of Bethesda"
    },
    {
      "verse": 16,
      "title": "The Father and the Son"
    },
    {
      "verse": 31,
      "title": "Testimonies about Jesus"
    },
    {
      "verse": 39,
      "title": "The Witness of Scripture"
    }
  ],
  "john:6": [
    {
      "verse": 1,
      "title": "The Feeding of the Five Thousand"
    },
    {
      "verse": 16,
      "title": "Jesus Walks on Water"
    },
    {
      "verse": 22,
      "title": "Jesus the Bread of Life"
    },
    {
      "verse": 59,
      "title": "Many Disciples Turn Back"
    },
    {
      "verse": 67,
      "title": "Peter’s Confession of Faith"
    }
  ],
  "john:7": [
    {
      "verse": 1,
      "title": "Jesus Teaches at the Feast"
    },
    {
      "verse": 25,
      "title": "Is Jesus the Christ?"
    },
    {
      "verse": 37,
      "title": "Living Water"
    },
    {
      "verse": 40,
      "title": "Division over Jesus"
    },
    {
      "verse": 45,
      "title": "The Unbelief of the Jewish Leaders"
    }
  ],
  "john:8": [
    {
      "verse": 1,
      "title": "The Woman Caught in Adultery"
    },
    {
      "verse": 12,
      "title": "Jesus the Light of the World"
    },
    {
      "verse": 30,
      "title": "The Truth Will Set You Free"
    },
    {
      "verse": 48,
      "title": "Before Abraham Was Born, I Am"
    }
  ],
  "john:9": [
    {
      "verse": 1,
      "title": "Jesus Heals the Man Born Blind"
    },
    {
      "verse": 13,
      "title": "The Pharisees Investigate the Healing"
    },
    {
      "verse": 35,
      "title": "Spiritual Blindness"
    }
  ],
  "john:10": [
    {
      "verse": 1,
      "title": "Jesus the Good Shepherd"
    },
    {
      "verse": 22,
      "title": "Jesus at the Feast of Dedication"
    },
    {
      "verse": 40,
      "title": "John’s Testimony Confirmed"
    }
  ],
  "john:11": [
    {
      "verse": 1,
      "title": "The Death of Lazarus"
    },
    {
      "verse": 17,
      "title": "Jesus Comforts Martha and Mary"
    },
    {
      "verse": 38,
      "title": "Jesus Raises Lazarus"
    },
    {
      "verse": 45,
      "title": "The Plot to Kill Jesus"
    }
  ],
  "john:12": [
    {
      "verse": 1,
      "title": "Mary Anoints Jesus"
    },
    {
      "verse": 9,
      "title": "The Plot to Kill Lazarus"
    },
    {
      "verse": 12,
      "title": "The Triumphal Entry"
    },
    {
      "verse": 20,
      "title": "Jesus Predicts His Death"
    },
    {
      "verse": 37,
      "title": "Belief and Unbelief"
    }
  ],
  "john:13": [
    {
      "verse": 1,
      "title": "Jesus Washes His Disciples’ Feet"
    },
    {
      "verse": 18,
      "title": "Jesus Predicts His Betrayal"
    },
    {
      "verse": 31,
      "title": "Love One Another"
    },
    {
      "verse": 36,
      "title": "Jesus Predicts Peter’s Denial"
    }
  ],
  "john:14": [
    {
      "verse": 1,
      "title": "In My Father’s House Are Many Rooms"
    },
    {
      "verse": 5,
      "title": "The Way, the Truth, and the Life"
    },
    {
      "verse": 15,
      "title": "Jesus Promises the Holy Spirit"
    },
    {
      "verse": 27,
      "title": "Peace I Leave with You"
    }
  ],
  "john:15": [
    {
      "verse": 1,
      "title": "Jesus the True Vine"
    },
    {
      "verse": 9,
      "title": "No Greater Love"
    },
    {
      "verse": 18,
      "title": "The Hatred of the World"
    }
  ],
  "john:16": [
    {
      "verse": 1,
      "title": "Persecution Foretold"
    },
    {
      "verse": 5,
      "title": "The Promise of the Holy Spirit"
    },
    {
      "verse": 17,
      "title": "Grief Will Turn to Joy"
    },
    {
      "verse": 23,
      "title": "Ask in My Name"
    }
  ],
  "john:17": [
    {
      "verse": 1,
      "title": "Prayer for the Son"
    },
    {
      "verse": 6,
      "title": "Prayer for the Disciples"
    },
    {
      "verse": 20,
      "title": "Prayer for All Believers"
    }
  ],
  "john:18": [
    {
      "verse": 1,
      "title": "The Betrayal of Jesus"
    },
    {
      "verse": 15,
      "title": "Peter’s First Denial"
    },
    {
      "verse": 19,
      "title": "Jesus before the High Priest"
    },
    {
      "verse": 25,
      "title": "Peter’s Second and Third Denials"
    },
    {
      "verse": 28,
      "title": "Jesus before Pilate"
    }
  ],
  "john:19": [
    {
      "verse": 1,
      "title": "The Soldiers Mock Jesus"
    },
    {
      "verse": 16,
      "title": "The Crucifixion"
    },
    {
      "verse": 28,
      "title": "The Death of Jesus"
    },
    {
      "verse": 31,
      "title": "Jesus’ Side Is Pierced"
    },
    {
      "verse": 38,
      "title": "The Burial of Jesus"
    }
  ],
  "john:20": [
    {
      "verse": 1,
      "title": "The Resurrection"
    },
    {
      "verse": 10,
      "title": "Jesus Appears to Mary Magdalene"
    },
    {
      "verse": 19,
      "title": "Jesus Appears to the Disciples"
    },
    {
      "verse": 24,
      "title": "Jesus Appears to Thomas"
    },
    {
      "verse": 30,
      "title": "The Purpose of John’s Book"
    }
  ],
  "john:21": [
    {
      "verse": 1,
      "title": "Jesus Appears by the Sea of Tiberias"
    },
    {
      "verse": 15,
      "title": "Jesus and Peter"
    },
    {
      "verse": 20,
      "title": "Jesus and the Beloved Disciple"
    }
  ],
  "acts:1": [
    {
      "verse": 1,
      "title": "Prologue"
    },
    {
      "verse": 6,
      "title": "The Ascension"
    },
    {
      "verse": 12,
      "title": "Matthias Replaces Judas"
    }
  ],
  "acts:2": [
    {
      "verse": 1,
      "title": "The Holy Spirit at Pentecost"
    },
    {
      "verse": 14,
      "title": "Peter Addresses the Crowd"
    },
    {
      "verse": 37,
      "title": "Three Thousand Believe"
    },
    {
      "verse": 42,
      "title": "The Fellowship of Believers"
    }
  ],
  "acts:3": [
    {
      "verse": 1,
      "title": "A Lame Man Walks"
    },
    {
      "verse": 11,
      "title": "Peter Speaks in Solomon’s Colonnade"
    }
  ],
  "acts:4": [
    {
      "verse": 1,
      "title": "Peter and John before the Sanhedrin"
    },
    {
      "verse": 13,
      "title": "The Name Forbidden"
    },
    {
      "verse": 23,
      "title": "The Believers’ Prayer"
    },
    {
      "verse": 32,
      "title": "Sharing among Believers"
    }
  ],
  "acts:5": [
    {
      "verse": 1,
      "title": "Ananias and Sapphira"
    },
    {
      "verse": 12,
      "title": "The Apostles Heal Many"
    },
    {
      "verse": 17,
      "title": "The Apostles Arrested and Freed"
    },
    {
      "verse": 24,
      "title": "The Apostles before the Sanhedrin"
    },
    {
      "verse": 33,
      "title": "Gamaliel’s Advice"
    }
  ],
  "acts:6": [
    {
      "verse": 1,
      "title": "The Choosing of the Seven"
    },
    {
      "verse": 8,
      "title": "The Arrest of Stephen"
    }
  ],
  "acts:7": [
    {
      "verse": 1,
      "title": "Stephen’s Address: The Call of Abraham"
    },
    {
      "verse": 9,
      "title": "Joseph Sold into Egypt"
    },
    {
      "verse": 15,
      "title": "Israel Oppressed in Egypt"
    },
    {
      "verse": 20,
      "title": "The Birth and Adoption of Moses"
    },
    {
      "verse": 23,
      "title": "The Rejection and Flight of Moses"
    },
    {
      "verse": 30,
      "title": "The Call of Moses"
    },
    {
      "verse": 39,
      "title": "The Rebellion of Israel"
    },
    {
      "verse": 44,
      "title": "The Tabernacle of the Testimony"
    },
    {
      "verse": 54,
      "title": "The Stoning of Stephen"
    }
  ],
  "acts:8": [
    {
      "verse": 1,
      "title": "Saul Persecutes the Church"
    },
    {
      "verse": 4,
      "title": "Philip in Samaria"
    },
    {
      "verse": 9,
      "title": "Simon the Sorcerer"
    },
    {
      "verse": 26,
      "title": "Philip and the Ethiopian"
    }
  ],
  "acts:9": [
    {
      "verse": 1,
      "title": "The Road to Damascus"
    },
    {
      "verse": 10,
      "title": "Ananias Baptizes Saul"
    },
    {
      "verse": 20,
      "title": "Saul Preaches at Damascus"
    },
    {
      "verse": 23,
      "title": "The Escape from Damascus"
    },
    {
      "verse": 26,
      "title": "Saul in Jerusalem"
    },
    {
      "verse": 31,
      "title": "The Healing of Aeneas"
    },
    {
      "verse": 36,
      "title": "The Raising of Tabitha"
    }
  ],
  "acts:10": [
    {
      "verse": 1,
      "title": "Cornelius Sends for Peter"
    },
    {
      "verse": 9,
      "title": "Peter’s Vision"
    },
    {
      "verse": 17,
      "title": "Peter Called to Caesarea"
    },
    {
      "verse": 24,
      "title": "Peter Visits Cornelius"
    },
    {
      "verse": 34,
      "title": "Good News for the Gentiles"
    },
    {
      "verse": 44,
      "title": "The Gentiles Receive the Holy Spirit"
    }
  ],
  "acts:11": [
    {
      "verse": 1,
      "title": "Peter’s Report at Jerusalem"
    },
    {
      "verse": 19,
      "title": "The Church at Antioch"
    }
  ],
  "acts:12": [
    {
      "verse": 1,
      "title": "James Killed, Peter Imprisoned"
    },
    {
      "verse": 5,
      "title": "The Rescue of Peter"
    },
    {
      "verse": 20,
      "title": "The Death of Herod"
    }
  ],
  "acts:13": [
    {
      "verse": 1,
      "title": "Paul’s First Missionary Journey Begins"
    },
    {
      "verse": 4,
      "title": "On Cyprus"
    },
    {
      "verse": 13,
      "title": "In Pisidian Antioch"
    },
    {
      "verse": 42,
      "title": "A Light for the Gentiles"
    }
  ],
  "acts:14": [
    {
      "verse": 1,
      "title": "Paul and Barnabas at Iconium"
    },
    {
      "verse": 8,
      "title": "The Visit to Lystra and Derbe"
    },
    {
      "verse": 21,
      "title": "Strengthening the Disciples"
    }
  ],
  "acts:15": [
    {
      "verse": 1,
      "title": "The Dispute over Circumcision"
    },
    {
      "verse": 5,
      "title": "The Council at Jerusalem"
    },
    {
      "verse": 22,
      "title": "The Letter to the Gentile Believers"
    },
    {
      "verse": 30,
      "title": "The Believers at Antioch Rejoice"
    },
    {
      "verse": 36,
      "title": "Paul’s Second Missionary Journey Begins"
    }
  ],
  "acts:16": [
    {
      "verse": 1,
      "title": "Timothy Joins Paul and Silas"
    },
    {
      "verse": 6,
      "title": "Paul’s Vision of the Macedonian"
    },
    {
      "verse": 11,
      "title": "Lydia’s Conversion in Philippi"
    },
    {
      "verse": 16,
      "title": "Paul and Silas Imprisoned"
    },
    {
      "verse": 25,
      "title": "The Conversion of the Jailer"
    },
    {
      "verse": 35,
      "title": "An Official Apology"
    }
  ],
  "acts:17": [
    {
      "verse": 1,
      "title": "The Uproar in Thessalonica"
    },
    {
      "verse": 10,
      "title": "The Character of the Bereans"
    },
    {
      "verse": 16,
      "title": "Paul in Athens"
    },
    {
      "verse": 22,
      "title": "Paul’s Address in the Areopagus"
    }
  ],
  "acts:18": [
    {
      "verse": 1,
      "title": "Paul Ministers in Corinth"
    },
    {
      "verse": 12,
      "title": "Paul before Gallio"
    },
    {
      "verse": 18,
      "title": "Paul Returns to Antioch"
    },
    {
      "verse": 23,
      "title": "Paul’s Third Missionary Journey Begins"
    }
  ],
  "acts:19": [
    {
      "verse": 1,
      "title": "The Holy Spirit Received at Ephesus"
    },
    {
      "verse": 8,
      "title": "Paul Ministers in Ephesus"
    },
    {
      "verse": 13,
      "title": "Seven Sons of Sceva"
    },
    {
      "verse": 21,
      "title": "The Riot in Ephesus"
    }
  ],
  "acts:20": [
    {
      "verse": 1,
      "title": "Paul in Macedonia and Greece"
    },
    {
      "verse": 7,
      "title": "Eutychus Revived at Troas"
    },
    {
      "verse": 13,
      "title": "From Troas to Miletus"
    },
    {
      "verse": 17,
      "title": "Paul’s Farewell to the Ephesians"
    }
  ],
  "acts:21": [
    {
      "verse": 1,
      "title": "Paul’s Journey to Jerusalem"
    },
    {
      "verse": 8,
      "title": "Paul Visits Philip the Evangelist"
    },
    {
      "verse": 17,
      "title": "Paul’s Arrival at Jerusalem"
    },
    {
      "verse": 27,
      "title": "Paul Seized at the Temple"
    },
    {
      "verse": 37,
      "title": "Paul Addresses the Crowd"
    }
  ],
  "acts:22": [
    {
      "verse": 1,
      "title": "Paul’s Defense to the Crowd"
    },
    {
      "verse": 22,
      "title": "Paul the Roman Citizen"
    }
  ],
  "acts:23": [
    {
      "verse": 1,
      "title": "Paul before the Sanhedrin"
    },
    {
      "verse": 12,
      "title": "The Plot to Kill Paul"
    },
    {
      "verse": 23,
      "title": "Paul Sent to Felix"
    }
  ],
  "acts:24": [
    {
      "verse": 1,
      "title": "Tertullus Prosecutes Paul"
    },
    {
      "verse": 10,
      "title": "Paul’s Defense to Felix"
    },
    {
      "verse": 22,
      "title": "The Verdict Postponed"
    }
  ],
  "acts:25": [
    {
      "verse": 1,
      "title": "Paul’s Trial before Festus"
    },
    {
      "verse": 10,
      "title": "Paul Appeals to Caesar"
    },
    {
      "verse": 13,
      "title": "Festus Consults Agrippa"
    },
    {
      "verse": 23,
      "title": "Paul before Agrippa and Bernice"
    }
  ],
  "acts:26": [
    {
      "verse": 1,
      "title": "Paul’s Testimony to Agrippa"
    },
    {
      "verse": 24,
      "title": "Festus Interrupts Paul’s Defense"
    }
  ],
  "acts:27": [
    {
      "verse": 1,
      "title": "Paul Sails for Rome"
    },
    {
      "verse": 13,
      "title": "The Storm at Sea"
    },
    {
      "verse": 27,
      "title": "The Shipwreck"
    }
  ],
  "acts:28": [
    {
      "verse": 1,
      "title": "Ashore on Malta"
    },
    {
      "verse": 11,
      "title": "Paul Arrives in Italy"
    },
    {
      "verse": 16,
      "title": "Paul Preaches at Rome"
    }
  ],
  "romans:1": [
    {
      "verse": 1,
      "title": "Paul Greets the Saints in Rome"
    },
    {
      "verse": 8,
      "title": "Unashamed of the Gospel"
    },
    {
      "verse": 18,
      "title": "God’s Wrath against Sin"
    }
  ],
  "romans:2": [
    {
      "verse": 1,
      "title": "God’s Righteous Judgment"
    },
    {
      "verse": 17,
      "title": "The Jews and the Law"
    }
  ],
  "romans:3": [
    {
      "verse": 1,
      "title": "God Remains Faithful"
    },
    {
      "verse": 9,
      "title": "There Is No One Righteous"
    },
    {
      "verse": 21,
      "title": "Righteousness through Faith in Christ"
    }
  ],
  "romans:4": [
    {
      "verse": 1,
      "title": "Abraham Justified by Faith"
    },
    {
      "verse": 13,
      "title": "Abraham Receives the Promise"
    }
  ],
  "romans:5": [
    {
      "verse": 1,
      "title": "The Triumph of Faith"
    },
    {
      "verse": 6,
      "title": "Christ’s Sacrifice for the Ungodly"
    },
    {
      "verse": 12,
      "title": "Death in Adam, Life in Christ"
    }
  ],
  "romans:6": [
    {
      "verse": 1,
      "title": "Dead to Sin, Alive to God"
    },
    {
      "verse": 15,
      "title": "The Wages of Sin"
    }
  ],
  "romans:7": [
    {
      "verse": 1,
      "title": "Release from the Law"
    },
    {
      "verse": 7,
      "title": "God’s Law Is Holy"
    },
    {
      "verse": 13,
      "title": "Struggling with Sin"
    }
  ],
  "romans:8": [
    {
      "verse": 1,
      "title": "Walking by the Spirit"
    },
    {
      "verse": 12,
      "title": "Heirs with Christ"
    },
    {
      "verse": 18,
      "title": "Future Glory"
    },
    {
      "verse": 28,
      "title": "God Works in All Things"
    },
    {
      "verse": 35,
      "title": "More than Conquerors"
    }
  ],
  "romans:9": [
    {
      "verse": 1,
      "title": "Paul’s Concern for the Jews"
    },
    {
      "verse": 6,
      "title": "God’s Sovereign Choice"
    },
    {
      "verse": 30,
      "title": "Israel’s Unbelief"
    }
  ],
  "romans:10": [
    {
      "verse": 1,
      "title": "The Word Brings Salvation"
    }
  ],
  "romans:11": [
    {
      "verse": 1,
      "title": "A Remnant Chosen by Grace"
    },
    {
      "verse": 11,
      "title": "The Ingrafting of the Gentiles"
    },
    {
      "verse": 25,
      "title": "All Israel Will Be Saved"
    },
    {
      "verse": 33,
      "title": "A Hymn of Praise"
    }
  ],
  "romans:12": [
    {
      "verse": 1,
      "title": "Living Sacrifices"
    },
    {
      "verse": 9,
      "title": "Love, Zeal, Hope, Hospitality"
    },
    {
      "verse": 14,
      "title": "Forgiveness"
    }
  ],
  "romans:13": [
    {
      "verse": 1,
      "title": "Submission to Authorities"
    },
    {
      "verse": 8,
      "title": "Love Fulfills the Law"
    },
    {
      "verse": 11,
      "title": "The Day Is Near"
    }
  ],
  "romans:14": [
    {
      "verse": 1,
      "title": "The Law of Liberty"
    },
    {
      "verse": 13,
      "title": "The Law of Love"
    }
  ],
  "romans:15": [
    {
      "verse": 1,
      "title": "Accept One Another"
    },
    {
      "verse": 7,
      "title": "Christ the Servant of Jews and Gentiles"
    },
    {
      "verse": 14,
      "title": "Paul the Minister to the Gentiles"
    },
    {
      "verse": 23,
      "title": "Paul’s Travel Plans"
    }
  ],
  "romans:16": [
    {
      "verse": 1,
      "title": "Personal Greetings and Love"
    },
    {
      "verse": 17,
      "title": "Avoid Divisions"
    },
    {
      "verse": 21,
      "title": "Greetings from Paul’s Fellow Workers"
    },
    {
      "verse": 25,
      "title": "Doxology"
    }
  ],
  "1corinthians:1": [
    {
      "verse": 1,
      "title": "Greetings from Paul and Sosthenes"
    },
    {
      "verse": 4,
      "title": "Thanksgiving"
    },
    {
      "verse": 10,
      "title": "Unity in the Church"
    },
    {
      "verse": 18,
      "title": "The Message of the Cross"
    },
    {
      "verse": 26,
      "title": "Wisdom from God"
    }
  ],
  "1corinthians:2": [
    {
      "verse": 1,
      "title": "Paul’s Message by the Spirit’s Power"
    },
    {
      "verse": 6,
      "title": "Spiritual Wisdom"
    }
  ],
  "1corinthians:3": [
    {
      "verse": 1,
      "title": "God’s Fellow Workers"
    },
    {
      "verse": 10,
      "title": "Christ Our Foundation"
    },
    {
      "verse": 16,
      "title": "God’s Temple and God’s Wisdom"
    }
  ],
  "1corinthians:4": [
    {
      "verse": 1,
      "title": "Servants of Christ"
    },
    {
      "verse": 14,
      "title": "Paul’s Fatherly Warning"
    }
  ],
  "1corinthians:5": [
    {
      "verse": 1,
      "title": "Immorality Rebuked"
    },
    {
      "verse": 9,
      "title": "Expel the Immoral Brother"
    }
  ],
  "1corinthians:6": [
    {
      "verse": 1,
      "title": "Lawsuits among Believers"
    },
    {
      "verse": 9,
      "title": "Members of Christ"
    },
    {
      "verse": 18,
      "title": "The Temple of the Holy Spirit"
    }
  ],
  "1corinthians:7": [
    {
      "verse": 1,
      "title": "Principles of Marriage"
    },
    {
      "verse": 17,
      "title": "Live Your Calling"
    },
    {
      "verse": 25,
      "title": "The Unmarried and Widowed"
    }
  ],
  "1corinthians:8": [
    {
      "verse": 1,
      "title": "Food Sacrificed to Idols"
    }
  ],
  "1corinthians:9": [
    {
      "verse": 1,
      "title": "The Rights of an Apostle"
    },
    {
      "verse": 19,
      "title": "Paul the Servant to All"
    },
    {
      "verse": 24,
      "title": "Run Your Race to Win"
    }
  ],
  "1corinthians:10": [
    {
      "verse": 1,
      "title": "Warnings from Israel’s Past"
    },
    {
      "verse": 14,
      "title": "Flee from Idolatry"
    },
    {
      "verse": 23,
      "title": "All to God’s Glory"
    }
  ],
  "1corinthians:11": [
    {
      "verse": 1,
      "title": "Roles in Worship"
    },
    {
      "verse": 17,
      "title": "Sharing in the Lord’s Supper"
    }
  ],
  "1corinthians:12": [
    {
      "verse": 1,
      "title": "Spiritual Gifts"
    },
    {
      "verse": 12,
      "title": "The Body of Christ"
    },
    {
      "verse": 27,
      "title": "The Greater Gifts"
    }
  ],
  "1corinthians:13": [
    {
      "verse": 1,
      "title": "Love"
    }
  ],
  "1corinthians:14": [
    {
      "verse": 1,
      "title": "Prophecy and Tongues"
    },
    {
      "verse": 26,
      "title": "Orderly Worship"
    }
  ],
  "1corinthians:15": [
    {
      "verse": 1,
      "title": "The Resurrection of Christ"
    },
    {
      "verse": 12,
      "title": "The Resurrection of the Dead"
    },
    {
      "verse": 20,
      "title": "The Order of Resurrection"
    },
    {
      "verse": 35,
      "title": "The Resurrection Body"
    },
    {
      "verse": 50,
      "title": "Where, O Death, Is Your Victory?"
    }
  ],
  "1corinthians:16": [
    {
      "verse": 1,
      "title": "The Collection for the Saints"
    },
    {
      "verse": 5,
      "title": "Paul’s Travel Plans"
    },
    {
      "verse": 10,
      "title": "Timothy and Apollos"
    },
    {
      "verse": 13,
      "title": "Concluding Exhortations"
    },
    {
      "verse": 19,
      "title": "Signature and Final Greetings"
    }
  ],
  "2corinthians:1": [
    {
      "verse": 1,
      "title": "Paul Greets the Corinthians"
    },
    {
      "verse": 3,
      "title": "The God of All Comfort"
    },
    {
      "verse": 12,
      "title": "Paul’s Change of Plans"
    }
  ],
  "2corinthians:2": [
    {
      "verse": 1,
      "title": "Reaffirm Your Love"
    },
    {
      "verse": 12,
      "title": "Triumph in Christ"
    }
  ],
  "2corinthians:3": [
    {
      "verse": 1,
      "title": "Ministers of a New Covenant"
    },
    {
      "verse": 7,
      "title": "The Glory of the New Covenant"
    }
  ],
  "2corinthians:4": [
    {
      "verse": 1,
      "title": "The Light of the Gospel"
    },
    {
      "verse": 7,
      "title": "Treasure in Jars of Clay"
    }
  ],
  "2corinthians:5": [
    {
      "verse": 1,
      "title": "Our Eternal Dwelling"
    },
    {
      "verse": 11,
      "title": "Ambassadors for Christ"
    }
  ],
  "2corinthians:6": [
    {
      "verse": 1,
      "title": "Paul’s Hardships and God’s Grace"
    },
    {
      "verse": 14,
      "title": "Do Not Be Unequally Yoked"
    }
  ],
  "2corinthians:7": [
    {
      "verse": 1,
      "title": "Paul’s Joy in the Corinthians"
    }
  ],
  "2corinthians:8": [
    {
      "verse": 1,
      "title": "Generosity Commended"
    },
    {
      "verse": 16,
      "title": "Titus Commended"
    }
  ],
  "2corinthians:9": [
    {
      "verse": 1,
      "title": "God Loves a Cheerful Giver"
    }
  ],
  "2corinthians:10": [
    {
      "verse": 1,
      "title": "Paul’s Apostolic Authority"
    }
  ],
  "2corinthians:11": [
    {
      "verse": 1,
      "title": "Paul and the False Apostles"
    },
    {
      "verse": 16,
      "title": "Paul’s Suffering and Service"
    }
  ],
  "2corinthians:12": [
    {
      "verse": 1,
      "title": "Paul’s Revelation"
    },
    {
      "verse": 5,
      "title": "Paul’s Thorn and God’s Grace"
    },
    {
      "verse": 11,
      "title": "Paul’s Concern for the Corinthians"
    }
  ],
  "2corinthians:13": [
    {
      "verse": 1,
      "title": "Examine Yourselves"
    },
    {
      "verse": 11,
      "title": "Benediction and Farewell"
    }
  ],
  "galatians:1": [
    {
      "verse": 1,
      "title": "Paul’s Greeting to the Galatians"
    },
    {
      "verse": 6,
      "title": "No Other Gospel"
    },
    {
      "verse": 10,
      "title": "Paul Preaches the Gospel"
    }
  ],
  "galatians:2": [
    {
      "verse": 1,
      "title": "The Council at Jerusalem"
    },
    {
      "verse": 11,
      "title": "Paul Confronts Cephas"
    }
  ],
  "galatians:3": [
    {
      "verse": 1,
      "title": "Faith and Belief"
    },
    {
      "verse": 10,
      "title": "Christ Has Redeemed Us"
    },
    {
      "verse": 15,
      "title": "The Purpose of the Law"
    },
    {
      "verse": 26,
      "title": "Sons through Faith in Christ"
    }
  ],
  "galatians:4": [
    {
      "verse": 1,
      "title": "Sons and Heirs"
    },
    {
      "verse": 8,
      "title": "Paul’s Concern for the Galatians"
    },
    {
      "verse": 21,
      "title": "Hagar and Sarah"
    }
  ],
  "galatians:5": [
    {
      "verse": 1,
      "title": "Freedom in Christ"
    },
    {
      "verse": 16,
      "title": "Walking by the Spirit"
    }
  ],
  "galatians:6": [
    {
      "verse": 1,
      "title": "Carry One Another’s Burdens"
    },
    {
      "verse": 11,
      "title": "Final Warnings and Blessings"
    }
  ],
  "ephesians:1": [
    {
      "verse": 1,
      "title": "Paul’s Greeting to the Ephesians"
    },
    {
      "verse": 3,
      "title": "Spiritual Blessings"
    },
    {
      "verse": 15,
      "title": "Spiritual Wisdom"
    }
  ],
  "ephesians:2": [
    {
      "verse": 1,
      "title": "Alive with Christ"
    },
    {
      "verse": 11,
      "title": "One in Christ"
    },
    {
      "verse": 19,
      "title": "Christ Our Cornerstone"
    }
  ],
  "ephesians:3": [
    {
      "verse": 1,
      "title": "The Mystery of the Gospel"
    },
    {
      "verse": 14,
      "title": "Paul’s Prayer for the Ephesians"
    }
  ],
  "ephesians:4": [
    {
      "verse": 1,
      "title": "Unity in the Body"
    },
    {
      "verse": 17,
      "title": "New Life in Christ"
    }
  ],
  "ephesians:5": [
    {
      "verse": 1,
      "title": "Imitators of God"
    },
    {
      "verse": 8,
      "title": "Children of Light"
    },
    {
      "verse": 21,
      "title": "Wives and Husbands"
    }
  ],
  "ephesians:6": [
    {
      "verse": 1,
      "title": "Children and Parents"
    },
    {
      "verse": 5,
      "title": "Serving with Honor"
    },
    {
      "verse": 10,
      "title": "The Full Armor of God"
    },
    {
      "verse": 21,
      "title": "Final Greetings"
    }
  ],
  "philippians:1": [
    {
      "verse": 1,
      "title": "Greetings from Paul and Timothy"
    },
    {
      "verse": 3,
      "title": "Thanksgiving and Prayer"
    },
    {
      "verse": 12,
      "title": "Paul’s Trials Advance the Gospel"
    },
    {
      "verse": 21,
      "title": "To Live Is Christ"
    },
    {
      "verse": 27,
      "title": "Worthy of the Gospel"
    }
  ],
  "philippians:2": [
    {
      "verse": 1,
      "title": "One in Christ"
    },
    {
      "verse": 5,
      "title": "The Mind of Christ"
    },
    {
      "verse": 12,
      "title": "Lights in the World"
    },
    {
      "verse": 19,
      "title": "Timothy and Epaphroditus"
    }
  ],
  "philippians:3": [
    {
      "verse": 1,
      "title": "Righteousness through Faith in Christ"
    },
    {
      "verse": 12,
      "title": "Pressing on toward the Goal"
    },
    {
      "verse": 17,
      "title": "Citizenship in Heaven"
    }
  ],
  "philippians:4": [
    {
      "verse": 1,
      "title": "Rejoice in the Lord"
    },
    {
      "verse": 10,
      "title": "The Generosity of the Philippians"
    },
    {
      "verse": 21,
      "title": "Final Greetings"
    }
  ],
  "colossians:1": [
    {
      "verse": 1,
      "title": "Greetings from Paul and Timothy"
    },
    {
      "verse": 3,
      "title": "Thanksgiving and Prayer"
    },
    {
      "verse": 15,
      "title": "The Supremacy of the Son"
    },
    {
      "verse": 24,
      "title": "Paul’s Suffering for the Church"
    }
  ],
  "colossians:2": [
    {
      "verse": 1,
      "title": "Absent in Body, Present in Spirit"
    },
    {
      "verse": 6,
      "title": "Alive with Christ"
    }
  ],
  "colossians:3": [
    {
      "verse": 1,
      "title": "Put On the New Self"
    },
    {
      "verse": 18,
      "title": "Christian Households"
    },
    {
      "verse": 22,
      "title": "Serving with Honor"
    }
  ],
  "colossians:4": [
    {
      "verse": 1,
      "title": "Prayerful Speech and Actions"
    },
    {
      "verse": 7,
      "title": "Greetings from Paul’s Fellow Workers"
    },
    {
      "verse": 15,
      "title": "Signature and Final Instructions"
    }
  ],
  "1thessalonians:1": [
    {
      "verse": 1,
      "title": "Greetings to the Thessalonians"
    }
  ],
  "1thessalonians:2": [
    {
      "verse": 1,
      "title": "Paul’s Ministry"
    },
    {
      "verse": 17,
      "title": "Paul’s Longing to Visit"
    }
  ],
  "1thessalonians:3": [
    {
      "verse": 1,
      "title": "Timothy’s Visit"
    },
    {
      "verse": 6,
      "title": "Timothy’s Encouraging Report"
    }
  ],
  "1thessalonians:4": [
    {
      "verse": 1,
      "title": "Living to Please God"
    },
    {
      "verse": 13,
      "title": "The Return of the Lord"
    }
  ],
  "1thessalonians:5": [
    {
      "verse": 1,
      "title": "The Day of the Lord"
    },
    {
      "verse": 12,
      "title": "Christian Living"
    },
    {
      "verse": 23,
      "title": "Final Blessings and Instructions"
    }
  ],
  "2thessalonians:1": [
    {
      "verse": 1,
      "title": "Greetings to the Thessalonians"
    },
    {
      "verse": 5,
      "title": "Christ’s Coming"
    }
  ],
  "2thessalonians:2": [
    {
      "verse": 1,
      "title": "The Man of Lawlessness"
    },
    {
      "verse": 13,
      "title": "Stand Firm"
    }
  ],
  "2thessalonians:3": [
    {
      "verse": 1,
      "title": "Request for Prayer"
    },
    {
      "verse": 6,
      "title": "A Warning against Idleness"
    },
    {
      "verse": 16,
      "title": "Signature and Final Greetings"
    }
  ],
  "1timothy:1": [
    {
      "verse": 1,
      "title": "Paul’s Greeting to Timothy"
    },
    {
      "verse": 3,
      "title": "Correcting False Teachers"
    },
    {
      "verse": 12,
      "title": "God’s Grace to Paul"
    }
  ],
  "1timothy:2": [
    {
      "verse": 1,
      "title": "A Call to Prayer"
    },
    {
      "verse": 9,
      "title": "Instructions to Women"
    }
  ],
  "1timothy:3": [
    {
      "verse": 1,
      "title": "Qualifications for Overseers"
    },
    {
      "verse": 8,
      "title": "Qualifications for Deacons"
    },
    {
      "verse": 14,
      "title": "The Mystery of Godliness"
    }
  ],
  "1timothy:4": [
    {
      "verse": 1,
      "title": "A Warning against Apostasy"
    },
    {
      "verse": 6,
      "title": "A Good Servant of Jesus Christ"
    }
  ],
  "1timothy:5": [
    {
      "verse": 1,
      "title": "Reproof and Respect"
    },
    {
      "verse": 3,
      "title": "Honoring True Widows"
    },
    {
      "verse": 17,
      "title": "Honoring Elders"
    },
    {
      "verse": 21,
      "title": "A Charge to Timothy"
    }
  ],
  "1timothy:6": [
    {
      "verse": 1,
      "title": "Serving with Honor"
    },
    {
      "verse": 3,
      "title": "Reject False Doctrines"
    },
    {
      "verse": 6,
      "title": "Godliness with Contentment"
    },
    {
      "verse": 11,
      "title": "Fight the Good Fight"
    },
    {
      "verse": 17,
      "title": "A Charge to the Rich"
    },
    {
      "verse": 20,
      "title": "Guard the Faith"
    }
  ],
  "2timothy:1": [
    {
      "verse": 1,
      "title": "Paul’s Greeting to Timothy"
    },
    {
      "verse": 3,
      "title": "Faithfulness under Persecution"
    },
    {
      "verse": 13,
      "title": "Holding to Sound Teaching"
    }
  ],
  "2timothy:2": [
    {
      "verse": 1,
      "title": "Grace and Perseverance"
    },
    {
      "verse": 14,
      "title": "The Lord’s Approved Workman"
    }
  ],
  "2timothy:3": [
    {
      "verse": 1,
      "title": "Evil in the Last Days"
    },
    {
      "verse": 10,
      "title": "All Scripture Is God-Breathed"
    }
  ],
  "2timothy:4": [
    {
      "verse": 1,
      "title": "Preach the Word"
    },
    {
      "verse": 9,
      "title": "Personal Concerns"
    },
    {
      "verse": 16,
      "title": "The Lord Remains Faithful"
    },
    {
      "verse": 19,
      "title": "Final Greetings"
    }
  ],
  "titus:1": [
    {
      "verse": 1,
      "title": "Paul’s Greeting to Titus"
    },
    {
      "verse": 5,
      "title": "Appointing Elders on Crete"
    },
    {
      "verse": 10,
      "title": "Correcting False Teachers"
    }
  ],
  "titus:2": [
    {
      "verse": 1,
      "title": "Teaching Sound Doctrine"
    },
    {
      "verse": 11,
      "title": "God’s Grace Brings Salvation"
    }
  ],
  "titus:3": [
    {
      "verse": 1,
      "title": "Heirs of Grace"
    },
    {
      "verse": 9,
      "title": "Avoid Divisions"
    },
    {
      "verse": 12,
      "title": "Final Remarks and Greetings"
    }
  ],
  "philemon:1": [
    {
      "verse": 1,
      "title": "Greetings from Paul and Timothy"
    },
    {
      "verse": 4,
      "title": "Philemon’s Faith and Love"
    },
    {
      "verse": 8,
      "title": "Paul’s Appeal for Onesimus"
    },
    {
      "verse": 23,
      "title": "Additional Greetings"
    }
  ],
  "hebrews:1": [
    {
      "verse": 1,
      "title": "The Supremacy of the Son"
    }
  ],
  "hebrews:2": [
    {
      "verse": 1,
      "title": "Salvation Confirmed"
    },
    {
      "verse": 5,
      "title": "Jesus like His Brothers"
    }
  ],
  "hebrews:3": [
    {
      "verse": 1,
      "title": "Jesus Our Apostle and High Priest"
    },
    {
      "verse": 7,
      "title": "Do Not Harden Your Hearts"
    },
    {
      "verse": 12,
      "title": "The Peril of Unbelief"
    }
  ],
  "hebrews:4": [
    {
      "verse": 1,
      "title": "The Sabbath Rest"
    },
    {
      "verse": 12,
      "title": "The Living Word"
    }
  ],
  "hebrews:5": [
    {
      "verse": 1,
      "title": "The Perfect High Priest"
    },
    {
      "verse": 11,
      "title": "Milk and Solid Food"
    }
  ],
  "hebrews:6": [
    {
      "verse": 1,
      "title": "A Call to Maturity"
    },
    {
      "verse": 13,
      "title": "God’s Unchangeable Promise"
    }
  ],
  "hebrews:7": [
    {
      "verse": 1,
      "title": "Melchizedek and Abraham"
    },
    {
      "verse": 11,
      "title": "A Superior Priesthood"
    }
  ],
  "hebrews:8": [
    {
      "verse": 1,
      "title": "Christ’s Eternal Priesthood"
    },
    {
      "verse": 6,
      "title": "The New Covenant"
    }
  ],
  "hebrews:9": [
    {
      "verse": 1,
      "title": "The Earthly Tabernacle"
    },
    {
      "verse": 11,
      "title": "Redemption through His Blood"
    }
  ],
  "hebrews:10": [
    {
      "verse": 1,
      "title": "Christ’s Perfect Sacrifice"
    },
    {
      "verse": 19,
      "title": "A Call to Persevere"
    }
  ],
  "hebrews:11": [
    {
      "verse": 1,
      "title": "Faith and Assurance"
    },
    {
      "verse": 4,
      "title": "The Faith of Abel, Enoch, Noah"
    },
    {
      "verse": 8,
      "title": "The Faith of Abraham and Sarah"
    },
    {
      "verse": 20,
      "title": "The Faith of Isaac, Jacob, and Joseph"
    },
    {
      "verse": 23,
      "title": "The Faith of Moses"
    },
    {
      "verse": 30,
      "title": "The Faith of Many"
    }
  ],
  "hebrews:12": [
    {
      "verse": 1,
      "title": "A Call to Endurance"
    },
    {
      "verse": 4,
      "title": "God Disciplines His Sons"
    },
    {
      "verse": 14,
      "title": "A Call to Holiness"
    },
    {
      "verse": 18,
      "title": "An Unshakable Kingdom"
    }
  ],
  "hebrews:13": [
    {
      "verse": 1,
      "title": "Brotherly Love"
    },
    {
      "verse": 5,
      "title": "Christ’s Unchanging Nature"
    },
    {
      "verse": 15,
      "title": "Sacrifice, Obedience, and Prayer"
    },
    {
      "verse": 20,
      "title": "Benediction and Farewell"
    }
  ],
  "james:1": [
    {
      "verse": 1,
      "title": "A Greeting from James"
    },
    {
      "verse": 2,
      "title": "Rejoicing in Trials"
    },
    {
      "verse": 13,
      "title": "Good and Perfect Gifts"
    },
    {
      "verse": 19,
      "title": "Hearing and Doing"
    }
  ],
  "james:2": [
    {
      "verse": 1,
      "title": "A Warning against Favoritism"
    },
    {
      "verse": 14,
      "title": "Faith and Works"
    }
  ],
  "james:3": [
    {
      "verse": 1,
      "title": "Taming the Tongue"
    },
    {
      "verse": 13,
      "title": "The Wisdom from Above"
    }
  ],
  "james:4": [
    {
      "verse": 1,
      "title": "A Warning against Pride"
    },
    {
      "verse": 7,
      "title": "Drawing Near to God"
    },
    {
      "verse": 13,
      "title": "Do Not Boast about Tomorrow"
    }
  ],
  "james:5": [
    {
      "verse": 1,
      "title": "A Warning to the Rich"
    },
    {
      "verse": 7,
      "title": "Patience in Suffering"
    },
    {
      "verse": 13,
      "title": "The Prayer of Faith"
    },
    {
      "verse": 19,
      "title": "Restoring a Sinner"
    }
  ],
  "1peter:1": [
    {
      "verse": 1,
      "title": "A Greeting from Peter"
    },
    {
      "verse": 3,
      "title": "A Living Hope"
    },
    {
      "verse": 13,
      "title": "A Call to Holiness"
    },
    {
      "verse": 22,
      "title": "The Enduring Word"
    }
  ],
  "1peter:2": [
    {
      "verse": 1,
      "title": "The Living Stone and Chosen People"
    },
    {
      "verse": 13,
      "title": "Submission to Authorities"
    },
    {
      "verse": 21,
      "title": "Christ’s Example of Suffering"
    }
  ],
  "1peter:3": [
    {
      "verse": 1,
      "title": "Wives and Husbands"
    },
    {
      "verse": 8,
      "title": "Turning from Evil"
    },
    {
      "verse": 14,
      "title": "Suffering for Righteousness"
    }
  ],
  "1peter:4": [
    {
      "verse": 1,
      "title": "Living for God’s Glory"
    },
    {
      "verse": 12,
      "title": "Suffering as Christians"
    }
  ],
  "1peter:5": [
    {
      "verse": 1,
      "title": "Instructions to Elders"
    },
    {
      "verse": 5,
      "title": "Cast Your Cares on Him"
    },
    {
      "verse": 10,
      "title": "Benediction and Farewell"
    }
  ],
  "2peter:1": [
    {
      "verse": 1,
      "title": "A Greeting from Peter"
    },
    {
      "verse": 3,
      "title": "Partakers of the Divine Nature"
    },
    {
      "verse": 16,
      "title": "Eyewitnesses of His Majesty"
    }
  ],
  "2peter:2": [
    {
      "verse": 1,
      "title": "Deliverance from False Prophets"
    }
  ],
  "2peter:3": [
    {
      "verse": 1,
      "title": "The Coming Judgment"
    },
    {
      "verse": 8,
      "title": "The Day of the Lord"
    },
    {
      "verse": 14,
      "title": "Final Exhortations"
    }
  ],
  "1john:1": [
    {
      "verse": 1,
      "title": "The Word of Life"
    },
    {
      "verse": 5,
      "title": "Walking in the Light"
    }
  ],
  "1john:2": [
    {
      "verse": 1,
      "title": "Jesus Our Advocate"
    },
    {
      "verse": 7,
      "title": "A New Commandment"
    },
    {
      "verse": 15,
      "title": "Do Not Love the World"
    },
    {
      "verse": 18,
      "title": "Beware of Antichrists"
    },
    {
      "verse": 24,
      "title": "Remain in Christ"
    }
  ],
  "1john:3": [
    {
      "verse": 1,
      "title": "Children of God"
    },
    {
      "verse": 11,
      "title": "Love One Another"
    }
  ],
  "1john:4": [
    {
      "verse": 1,
      "title": "Testing the Spirits"
    },
    {
      "verse": 7,
      "title": "Love Comes from God"
    }
  ],
  "1john:5": [
    {
      "verse": 1,
      "title": "Overcoming the World"
    },
    {
      "verse": 9,
      "title": "God’s Testimony about His Son"
    },
    {
      "verse": 13,
      "title": "Effective Prayer"
    },
    {
      "verse": 18,
      "title": "The True God"
    }
  ],
  "2john:1": [
    {
      "verse": 1,
      "title": "A Greeting from the Elder"
    },
    {
      "verse": 4,
      "title": "Walking in the Truth"
    },
    {
      "verse": 7,
      "title": "Beware of Deceivers"
    },
    {
      "verse": 12,
      "title": "Conclusion"
    }
  ],
  "3john:1": [
    {
      "verse": 1,
      "title": "A Greeting from the Elder"
    },
    {
      "verse": 5,
      "title": "Gaius Commended for Hospitality"
    },
    {
      "verse": 9,
      "title": "Diotrephes and Demetrius"
    },
    {
      "verse": 13,
      "title": "Conclusion"
    }
  ],
  "jude:1": [
    {
      "verse": 1,
      "title": "A Greeting from Jude"
    },
    {
      "verse": 3,
      "title": "God’s Judgment on the Ungodly"
    },
    {
      "verse": 17,
      "title": "A Call to Persevere"
    },
    {
      "verse": 24,
      "title": "Doxology"
    }
  ],
  "revelation:1": [
    {
      "verse": 1,
      "title": "Prologue"
    },
    {
      "verse": 4,
      "title": "John Greets the Seven Churches"
    },
    {
      "verse": 9,
      "title": "John’s Vision on Patmos"
    }
  ],
  "revelation:2": [
    {
      "verse": 1,
      "title": "To the Church in Ephesus"
    },
    {
      "verse": 8,
      "title": "To the Church in Smyrna"
    },
    {
      "verse": 12,
      "title": "To the Church in Pergamum"
    },
    {
      "verse": 18,
      "title": "To the Church in Thyatira"
    }
  ],
  "revelation:3": [
    {
      "verse": 1,
      "title": "To the Church in Sardis"
    },
    {
      "verse": 7,
      "title": "To the Church in Philadelphia"
    },
    {
      "verse": 14,
      "title": "To the Church in Laodicea"
    }
  ],
  "revelation:4": [
    {
      "verse": 1,
      "title": "The Throne in Heaven"
    },
    {
      "verse": 5,
      "title": "Worship of the Creator"
    }
  ],
  "revelation:5": [
    {
      "verse": 1,
      "title": "The Lamb Takes the Scroll"
    },
    {
      "verse": 11,
      "title": "The Lamb Exalted"
    }
  ],
  "revelation:6": [
    {
      "verse": 1,
      "title": "The First Seal: The White Horse"
    },
    {
      "verse": 3,
      "title": "The Second Seal: War"
    },
    {
      "verse": 5,
      "title": "The Third Seal: Famine"
    },
    {
      "verse": 7,
      "title": "The Fourth Seal: Death"
    },
    {
      "verse": 9,
      "title": "The Fifth Seal: The Martyrs"
    },
    {
      "verse": 12,
      "title": "The Sixth Seal: Terror"
    }
  ],
  "revelation:7": [
    {
      "verse": 1,
      "title": "144,000 Sealed"
    },
    {
      "verse": 9,
      "title": "Praise from the Great Multitude"
    }
  ],
  "revelation:8": [
    {
      "verse": 1,
      "title": "The Seventh Seal"
    },
    {
      "verse": 6,
      "title": "The First Four Trumpets"
    }
  ],
  "revelation:9": [
    {
      "verse": 1,
      "title": "The Fifth Trumpet"
    },
    {
      "verse": 13,
      "title": "The Sixth Trumpet"
    }
  ],
  "revelation:10": [
    {
      "verse": 1,
      "title": "The Angel and the Small Scroll"
    }
  ],
  "revelation:11": [
    {
      "verse": 1,
      "title": "The Two Witnesses"
    },
    {
      "verse": 7,
      "title": "The Witnesses Killed and Raised"
    },
    {
      "verse": 15,
      "title": "The Seventh Trumpet"
    }
  ],
  "revelation:12": [
    {
      "verse": 1,
      "title": "The Woman and the Dragon"
    },
    {
      "verse": 7,
      "title": "The War in Heaven"
    },
    {
      "verse": 13,
      "title": "The Woman Persecuted"
    }
  ],
  "revelation:13": [
    {
      "verse": 1,
      "title": "The Beast from the Sea"
    },
    {
      "verse": 11,
      "title": "The Beast from the Earth"
    },
    {
      "verse": 16,
      "title": "The Mark of the Beast"
    }
  ],
  "revelation:14": [
    {
      "verse": 1,
      "title": "The Lamb and the 144,000"
    },
    {
      "verse": 6,
      "title": "The Three Angels and Babylon’s Fall"
    },
    {
      "verse": 14,
      "title": "The Harvest of the Earth"
    }
  ],
  "revelation:15": [
    {
      "verse": 1,
      "title": "The Song of Moses and the Lamb"
    },
    {
      "verse": 5,
      "title": "Preparation for Judgment"
    }
  ],
  "revelation:16": [
    {
      "verse": 1,
      "title": "The First Six Bowls of Wrath"
    },
    {
      "verse": 17,
      "title": "The Seventh Bowl of Wrath"
    }
  ],
  "revelation:17": [
    {
      "verse": 1,
      "title": "The Woman on the Beast"
    },
    {
      "verse": 6,
      "title": "The Mystery Explained"
    },
    {
      "verse": 14,
      "title": "The Victory of the Lamb"
    }
  ],
  "revelation:18": [
    {
      "verse": 1,
      "title": "Babylon Is Fallen"
    },
    {
      "verse": 9,
      "title": "Lament over Babylon"
    },
    {
      "verse": 21,
      "title": "The Doom of Babylon"
    }
  ],
  "revelation:19": [
    {
      "verse": 1,
      "title": "Rejoicing in Heaven"
    },
    {
      "verse": 6,
      "title": "The Marriage of the Lamb"
    },
    {
      "verse": 11,
      "title": "The Rider on the White Horse"
    },
    {
      "verse": 17,
      "title": "Defeat of the Beast and False Prophet"
    }
  ],
  "revelation:20": [
    {
      "verse": 1,
      "title": "Satan Bound"
    },
    {
      "verse": 7,
      "title": "Satan Cast into the Lake of Fire"
    },
    {
      "verse": 11,
      "title": "Judgment before the Great White Throne"
    }
  ],
  "revelation:21": [
    {
      "verse": 1,
      "title": "A New Heaven and a New Earth"
    },
    {
      "verse": 9,
      "title": "The New Jerusalem"
    }
  ],
  "revelation:22": [
    {
      "verse": 1,
      "title": "The River of Life"
    },
    {
      "verse": 6,
      "title": "Jesus Is Coming"
    },
    {
      "verse": 18,
      "title": "Nothing May Be Added or Removed"
    }
  ]
};

export function getBibleSectionHeading(bookId: string, chapter: number, verse: number): string | null {
  return BIBLE_SECTION_HEADINGS[`${bookId}:${chapter}`]?.find(section => section.verse === verse)?.title ?? null;
}
