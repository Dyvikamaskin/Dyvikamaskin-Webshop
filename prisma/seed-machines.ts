/**
 * Seed construction equipment makes and models.
 * Run with: node node_modules/tsx/dist/cli.mjs prisma/seed-machines.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/app/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ─── Data ────────────────────────────────────────────────────────────────────

const MAKES_AND_MODELS: {
  name: string;
  slug: string;
  models: { name: string; type: string; series?: string; yearFrom?: number; yearTo?: number }[];
}[] = [
  {
    name: "Volvo CE",
    slug: "volvo-ce",
    models: [
      // Excavators
      { name: "EC15E",  type: "MINI_EXCAVATOR", series: "EC-series", yearFrom: 2016 },
      { name: "EC20E",  type: "MINI_EXCAVATOR", series: "EC-series", yearFrom: 2016 },
      { name: "EC27E",  type: "MINI_EXCAVATOR", series: "EC-series", yearFrom: 2016 },
      { name: "EC35E",  type: "MINI_EXCAVATOR", series: "EC-series", yearFrom: 2016 },
      { name: "EC55E",  type: "MINI_EXCAVATOR", series: "EC-series", yearFrom: 2016 },
      { name: "EC80E",  type: "MINI_EXCAVATOR", series: "EC-series", yearFrom: 2016 },
      { name: "EC140E", type: "EXCAVATOR", series: "EC-series", yearFrom: 2014 },
      { name: "EC160E", type: "EXCAVATOR", series: "EC-series", yearFrom: 2014 },
      { name: "EC220E", type: "EXCAVATOR", series: "EC-series", yearFrom: 2014 },
      { name: "EC250E", type: "EXCAVATOR", series: "EC-series", yearFrom: 2014 },
      { name: "EC300E", type: "EXCAVATOR", series: "EC-series", yearFrom: 2014 },
      { name: "EC350E", type: "EXCAVATOR", series: "EC-series", yearFrom: 2015 },
      { name: "EC380E", type: "EXCAVATOR", series: "EC-series", yearFrom: 2015 },
      { name: "EC480E", type: "EXCAVATOR", series: "EC-series", yearFrom: 2015 },
      { name: "EC550E", type: "EXCAVATOR", series: "EC-series", yearFrom: 2016 },
      { name: "EC750E", type: "EXCAVATOR", series: "EC-series", yearFrom: 2016 },
      { name: "EC950E", type: "EXCAVATOR", series: "EC-series", yearFrom: 2017 },
      // Wheel Loaders
      { name: "L60H",   type: "WHEEL_LOADER", series: "L-series", yearFrom: 2015 },
      { name: "L70H",   type: "WHEEL_LOADER", series: "L-series", yearFrom: 2015 },
      { name: "L90H",   type: "WHEEL_LOADER", series: "L-series", yearFrom: 2015 },
      { name: "L110H",  type: "WHEEL_LOADER", series: "L-series", yearFrom: 2015 },
      { name: "L120H",  type: "WHEEL_LOADER", series: "L-series", yearFrom: 2015 },
      { name: "L150H",  type: "WHEEL_LOADER", series: "L-series", yearFrom: 2015 },
      { name: "L180H",  type: "WHEEL_LOADER", series: "L-series", yearFrom: 2015 },
      { name: "L220H",  type: "WHEEL_LOADER", series: "L-series", yearFrom: 2016 },
      { name: "L260H",  type: "WHEEL_LOADER", series: "L-series", yearFrom: 2016 },
      { name: "L350H",  type: "WHEEL_LOADER", series: "L-series", yearFrom: 2016 },
      // Articulated Haulers
      { name: "A25G",   type: "ARTICULATED_HAULER", series: "A-series", yearFrom: 2012 },
      { name: "A30G",   type: "ARTICULATED_HAULER", series: "A-series", yearFrom: 2012 },
      { name: "A35G",   type: "ARTICULATED_HAULER", series: "A-series", yearFrom: 2012 },
      { name: "A40G",   type: "ARTICULATED_HAULER", series: "A-series", yearFrom: 2012 },
      { name: "A45G",   type: "ARTICULATED_HAULER", series: "A-series", yearFrom: 2015 },
      { name: "A60H",   type: "ARTICULATED_HAULER", series: "A-series", yearFrom: 2016 },
    ],
  },
  {
    name: "Caterpillar",
    slug: "caterpillar",
    models: [
      // Mini excavators
      { name: "301.7 CR", type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "302 CR",   type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "303 CR",   type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "305 CR",   type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "308 CR",   type: "MINI_EXCAVATOR", yearFrom: 2018 },
      // Excavators
      { name: "315",      type: "EXCAVATOR", yearFrom: 2020 },
      { name: "320",      type: "EXCAVATOR", yearFrom: 2019 },
      { name: "323",      type: "EXCAVATOR", yearFrom: 2019 },
      { name: "330",      type: "EXCAVATOR", yearFrom: 2019 },
      { name: "340",      type: "EXCAVATOR", yearFrom: 2019 },
      { name: "352",      type: "EXCAVATOR", yearFrom: 2020 },
      { name: "374",      type: "EXCAVATOR", yearFrom: 2018 },
      { name: "390",      type: "EXCAVATOR", yearFrom: 2018 },
      { name: "395",      type: "EXCAVATOR", yearFrom: 2021 },
      // Wheel Loaders
      { name: "906M",     type: "WHEEL_LOADER", yearFrom: 2017 },
      { name: "910M",     type: "WHEEL_LOADER", yearFrom: 2017 },
      { name: "914M",     type: "WHEEL_LOADER", yearFrom: 2017 },
      { name: "930M",     type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "938M",     type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "950M",     type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "962M",     type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "972M",     type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "980M",     type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "982M",     type: "WHEEL_LOADER", yearFrom: 2018 },
      // Bulldozers
      { name: "D4",       type: "BULLDOZER", yearFrom: 2018 },
      { name: "D5",       type: "BULLDOZER", yearFrom: 2018 },
      { name: "D6T",      type: "BULLDOZER", yearFrom: 2017 },
      { name: "D7E",      type: "BULLDOZER", yearFrom: 2015 },
      { name: "D8T",      type: "BULLDOZER", yearFrom: 2017 },
      { name: "D9T",      type: "BULLDOZER", yearFrom: 2017 },
      { name: "D10T2",    type: "BULLDOZER", yearFrom: 2014 },
      { name: "D11",      type: "BULLDOZER", yearFrom: 2019 },
      // Articulated trucks
      { name: "725",      type: "ARTICULATED_HAULER", yearFrom: 2018 },
      { name: "730",      type: "ARTICULATED_HAULER", yearFrom: 2018 },
      { name: "735",      type: "ARTICULATED_HAULER", yearFrom: 2018 },
      { name: "740",      type: "ARTICULATED_HAULER", yearFrom: 2018 },
      { name: "745",      type: "ARTICULATED_HAULER", yearFrom: 2018 },
    ],
  },
  {
    name: "Komatsu",
    slug: "komatsu",
    models: [
      // Mini excavators
      { name: "PC26MR-3",   type: "MINI_EXCAVATOR", yearFrom: 2010 },
      { name: "PC35MR-3",   type: "MINI_EXCAVATOR", yearFrom: 2010 },
      { name: "PC55MR-3",   type: "MINI_EXCAVATOR", yearFrom: 2010 },
      { name: "PC80MR-3",   type: "MINI_EXCAVATOR", yearFrom: 2011 },
      // Excavators
      { name: "PC88MR-10",  type: "EXCAVATOR", yearFrom: 2018 },
      { name: "PC138US-11", type: "EXCAVATOR", yearFrom: 2019 },
      { name: "PC210LC-11", type: "EXCAVATOR", yearFrom: 2019 },
      { name: "PC290LC-11", type: "EXCAVATOR", yearFrom: 2019 },
      { name: "PC360LC-11", type: "EXCAVATOR", yearFrom: 2019 },
      { name: "PC490LC-11", type: "EXCAVATOR", yearFrom: 2019 },
      { name: "PC700LC-11", type: "EXCAVATOR", yearFrom: 2020 },
      { name: "PC1250-11",  type: "EXCAVATOR", yearFrom: 2020 },
      // Wheel Loaders
      { name: "WA200-8",    type: "WHEEL_LOADER", yearFrom: 2018 },
      { name: "WA270-8",    type: "WHEEL_LOADER", yearFrom: 2018 },
      { name: "WA380-8",    type: "WHEEL_LOADER", yearFrom: 2018 },
      { name: "WA470-8",    type: "WHEEL_LOADER", yearFrom: 2018 },
      { name: "WA500-8",    type: "WHEEL_LOADER", yearFrom: 2019 },
      { name: "WA600-8",    type: "WHEEL_LOADER", yearFrom: 2019 },
      // Bulldozers
      { name: "D51EX-24",   type: "BULLDOZER", yearFrom: 2018 },
      { name: "D61EX-24",   type: "BULLDOZER", yearFrom: 2018 },
      { name: "D65PX-18",   type: "BULLDOZER", yearFrom: 2018 },
      { name: "D85EX-18",   type: "BULLDOZER", yearFrom: 2018 },
      { name: "D155AX-8",   type: "BULLDOZER", yearFrom: 2019 },
      // Articulated trucks
      { name: "HM300-5",    type: "ARTICULATED_HAULER", yearFrom: 2018 },
      { name: "HM400-5",    type: "ARTICULATED_HAULER", yearFrom: 2018 },
    ],
  },
  {
    name: "JCB",
    slug: "jcb",
    models: [
      // Mini excavators
      { name: "8008 CTS", type: "MINI_EXCAVATOR", yearFrom: 2017 },
      { name: "8018 CTS", type: "MINI_EXCAVATOR", yearFrom: 2017 },
      { name: "8026 CTS", type: "MINI_EXCAVATOR", yearFrom: 2017 },
      { name: "8035 ZTS", type: "MINI_EXCAVATOR", yearFrom: 2017 },
      { name: "8055 RTS", type: "MINI_EXCAVATOR", yearFrom: 2017 },
      { name: "8085 ZTS", type: "MINI_EXCAVATOR", yearFrom: 2018 },
      // Excavators
      { name: "JS130",    type: "EXCAVATOR", yearFrom: 2015 },
      { name: "JS145",    type: "EXCAVATOR", yearFrom: 2015 },
      { name: "JS220",    type: "EXCAVATOR", yearFrom: 2015 },
      { name: "JS220XD",  type: "EXCAVATOR", yearFrom: 2016 },
      { name: "JS290",    type: "EXCAVATOR", yearFrom: 2016 },
      { name: "JS370",    type: "EXCAVATOR", yearFrom: 2017 },
      // Wheel Loaders
      { name: "416S",     type: "WHEEL_LOADER", yearFrom: 2018 },
      { name: "426S",     type: "WHEEL_LOADER", yearFrom: 2018 },
      { name: "436E",     type: "WHEEL_LOADER", yearFrom: 2018 },
      { name: "457",      type: "WHEEL_LOADER", yearFrom: 2019 },
      // Backhoe loaders
      { name: "3CX",      type: "BACKHOE_LOADER", yearFrom: 2015 },
      { name: "4CX",      type: "BACKHOE_LOADER", yearFrom: 2015 },
      // Telehandlers
      { name: "535-95",   type: "TELEHANDLER", yearFrom: 2017 },
      { name: "536-60",   type: "TELEHANDLER", yearFrom: 2017 },
      { name: "540-140",  type: "TELEHANDLER", yearFrom: 2017 },
      { name: "541-70",   type: "TELEHANDLER", yearFrom: 2017 },
    ],
  },
  {
    name: "Liebherr",
    slug: "liebherr",
    models: [
      // Mini excavators
      { name: "R906 Compact", type: "MINI_EXCAVATOR", yearFrom: 2014 },
      // Excavators
      { name: "R916",   type: "EXCAVATOR", yearFrom: 2015 },
      { name: "R920",   type: "EXCAVATOR", yearFrom: 2015 },
      { name: "R926",   type: "EXCAVATOR", yearFrom: 2015 },
      { name: "R934",   type: "EXCAVATOR", yearFrom: 2015 },
      { name: "R938",   type: "EXCAVATOR", yearFrom: 2015 },
      { name: "R944",   type: "EXCAVATOR", yearFrom: 2016 },
      { name: "R950",   type: "EXCAVATOR", yearFrom: 2016 },
      { name: "R960",   type: "EXCAVATOR", yearFrom: 2016 },
      { name: "R970",   type: "EXCAVATOR", yearFrom: 2017 },
      { name: "R980",   type: "EXCAVATOR", yearFrom: 2018 },
      // Wheel Loaders
      { name: "L518",   type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "L524",   type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "L526",   type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "L538",   type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "L546",   type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "L556",   type: "WHEEL_LOADER", yearFrom: 2017 },
      { name: "L566",   type: "WHEEL_LOADER", yearFrom: 2017 },
      { name: "L576",   type: "WHEEL_LOADER", yearFrom: 2017 },
      { name: "L580",   type: "WHEEL_LOADER", yearFrom: 2018 },
      { name: "L586",   type: "WHEEL_LOADER", yearFrom: 2018 },
    ],
  },
  {
    name: "Doosan / Develon",
    slug: "doosan-develon",
    models: [
      // Mini excavators
      { name: "DX27Z-7",  type: "MINI_EXCAVATOR", yearFrom: 2020 },
      { name: "DX35Z-7",  type: "MINI_EXCAVATOR", yearFrom: 2020 },
      { name: "DX57W-7",  type: "MINI_EXCAVATOR", yearFrom: 2020 },
      { name: "DX85R-7",  type: "MINI_EXCAVATOR", yearFrom: 2020 },
      // Excavators
      { name: "DX140W-7", type: "EXCAVATOR", yearFrom: 2020 },
      { name: "DX180LC-7",type: "EXCAVATOR", yearFrom: 2020 },
      { name: "DX225LC-7",type: "EXCAVATOR", yearFrom: 2020 },
      { name: "DX300LC-7",type: "EXCAVATOR", yearFrom: 2021 },
      { name: "DX340LC-7",type: "EXCAVATOR", yearFrom: 2021 },
      { name: "DX380LC-7",type: "EXCAVATOR", yearFrom: 2021 },
      { name: "DX420LC-7",type: "EXCAVATOR", yearFrom: 2021 },
      { name: "DX490LC-7",type: "EXCAVATOR", yearFrom: 2022 },
      // Wheel Loaders
      { name: "DL250-7",  type: "WHEEL_LOADER", yearFrom: 2021 },
      { name: "DL300-7",  type: "WHEEL_LOADER", yearFrom: 2021 },
      { name: "DL420-7",  type: "WHEEL_LOADER", yearFrom: 2021 },
    ],
  },
  {
    name: "Hitachi",
    slug: "hitachi",
    models: [
      // Mini excavators
      { name: "ZX17U-6",   type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "ZX26U-6",   type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "ZX35U-6",   type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "ZX55U-6",   type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "ZX85US-6",  type: "MINI_EXCAVATOR", yearFrom: 2019 },
      // Excavators
      { name: "ZX130-6",   type: "EXCAVATOR", yearFrom: 2019 },
      { name: "ZX210LC-6", type: "EXCAVATOR", yearFrom: 2019 },
      { name: "ZX250LC-6", type: "EXCAVATOR", yearFrom: 2019 },
      { name: "ZX300LC-6", type: "EXCAVATOR", yearFrom: 2020 },
      { name: "ZX350LC-6", type: "EXCAVATOR", yearFrom: 2020 },
      { name: "ZX470LCH-6",type: "EXCAVATOR", yearFrom: 2020 },
      { name: "ZX520LCH-6",type: "EXCAVATOR", yearFrom: 2020 },
      { name: "ZX650LC-6", type: "EXCAVATOR", yearFrom: 2021 },
      { name: "ZX890LCH-6",type: "EXCAVATOR", yearFrom: 2021 },
    ],
  },
  {
    name: "Case CE",
    slug: "case-ce",
    models: [
      // Mini excavators
      { name: "CX17C",    type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "CX26C",    type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "CX37C",    type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "CX57C",    type: "MINI_EXCAVATOR", yearFrom: 2018 },
      // Excavators
      { name: "CX130D",   type: "EXCAVATOR", yearFrom: 2015 },
      { name: "CX160D",   type: "EXCAVATOR", yearFrom: 2015 },
      { name: "CX210D",   type: "EXCAVATOR", yearFrom: 2015 },
      { name: "CX245D SR",type: "EXCAVATOR", yearFrom: 2016 },
      { name: "CX300D",   type: "EXCAVATOR", yearFrom: 2016 },
      { name: "CX370D",   type: "EXCAVATOR", yearFrom: 2017 },
      { name: "CX490D",   type: "EXCAVATOR", yearFrom: 2018 },
      // Wheel Loaders
      { name: "621G",     type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "721G",     type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "821G",     type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "921G",     type: "WHEEL_LOADER", yearFrom: 2017 },
      // Backhoe loaders
      { name: "570T",     type: "BACKHOE_LOADER", yearFrom: 2018 },
      { name: "580 Super T", type: "BACKHOE_LOADER", yearFrom: 2018 },
      { name: "590 Super T", type: "BACKHOE_LOADER", yearFrom: 2018 },
    ],
  },
  {
    name: "Hyundai CE",
    slug: "hyundai-ce",
    models: [
      // Mini excavators
      { name: "R35Z-9A",  type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "R55-9A",   type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "R80CR-9A", type: "MINI_EXCAVATOR", yearFrom: 2018 },
      // Excavators
      { name: "HX140L",   type: "EXCAVATOR", yearFrom: 2016 },
      { name: "HX160L",   type: "EXCAVATOR", yearFrom: 2016 },
      { name: "HX210A",   type: "EXCAVATOR", yearFrom: 2016 },
      { name: "HX235LCR", type: "EXCAVATOR", yearFrom: 2017 },
      { name: "HX300L",   type: "EXCAVATOR", yearFrom: 2017 },
      { name: "HX360L",   type: "EXCAVATOR", yearFrom: 2018 },
      { name: "HX380L",   type: "EXCAVATOR", yearFrom: 2018 },
      { name: "HX480L",   type: "EXCAVATOR", yearFrom: 2019 },
      // Wheel Loaders
      { name: "HL730-9A", type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "HL740-9A", type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "HL760-9A", type: "WHEEL_LOADER", yearFrom: 2016 },
      { name: "HL780-9A", type: "WHEEL_LOADER", yearFrom: 2017 },
    ],
  },
  {
    name: "Takeuchi",
    slug: "takeuchi",
    models: [
      { name: "TB210R",  type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "TB216",   type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "TB225",   type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "TB230",   type: "MINI_EXCAVATOR", yearFrom: 2020 },
      { name: "TB235",   type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "TB250-2", type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "TB260",   type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "TB270",   type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "TB285",   type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "TB295W",  type: "MINI_EXCAVATOR", yearFrom: 2019 },
    ],
  },
  {
    name: "Kubota",
    slug: "kubota",
    models: [
      { name: "KX016-4",  type: "MINI_EXCAVATOR", yearFrom: 2015 },
      { name: "KX018-4",  type: "MINI_EXCAVATOR", yearFrom: 2015 },
      { name: "KX027-4",  type: "MINI_EXCAVATOR", yearFrom: 2015 },
      { name: "KX040-4",  type: "MINI_EXCAVATOR", yearFrom: 2015 },
      { name: "KX057-4",  type: "MINI_EXCAVATOR", yearFrom: 2015 },
      { name: "KX080-4",  type: "MINI_EXCAVATOR", yearFrom: 2016 },
      { name: "U17-3",    type: "MINI_EXCAVATOR", yearFrom: 2016 },
      { name: "U25-3",    type: "MINI_EXCAVATOR", yearFrom: 2016 },
      { name: "U36-4",    type: "MINI_EXCAVATOR", yearFrom: 2017 },
      { name: "U55-4",    type: "MINI_EXCAVATOR", yearFrom: 2017 },
    ],
  },
  {
    name: "Bobcat",
    slug: "bobcat",
    models: [
      // Mini excavators
      { name: "E10",   type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "E19",   type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "E26",   type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "E32",   type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "E35",   type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "E42",   type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "E50",   type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "E55",   type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "E85",   type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "E165",  type: "MINI_EXCAVATOR", yearFrom: 2020 },
      // Skid steers
      { name: "S66",   type: "SKID_STEER", yearFrom: 2017 },
      { name: "S76",   type: "SKID_STEER", yearFrom: 2017 },
      { name: "S86",   type: "SKID_STEER", yearFrom: 2017 },
      { name: "S100",  type: "SKID_STEER", yearFrom: 2020 },
      { name: "S450",  type: "SKID_STEER", yearFrom: 2017 },
      { name: "S530",  type: "SKID_STEER", yearFrom: 2017 },
      { name: "S570",  type: "SKID_STEER", yearFrom: 2017 },
      { name: "S590",  type: "SKID_STEER", yearFrom: 2017 },
      { name: "S630",  type: "SKID_STEER", yearFrom: 2017 },
      { name: "S650",  type: "SKID_STEER", yearFrom: 2017 },
      { name: "S770",  type: "SKID_STEER", yearFrom: 2018 },
      { name: "S850",  type: "SKID_STEER", yearFrom: 2018 },
    ],
  },
  {
    name: "Wacker Neuson",
    slug: "wacker-neuson",
    models: [
      // Mini excavators
      { name: "EZ17e",   type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "EZ26",    type: "MINI_EXCAVATOR", yearFrom: 2016 },
      { name: "EZ36",    type: "MINI_EXCAVATOR", yearFrom: 2016 },
      { name: "ET18",    type: "MINI_EXCAVATOR", yearFrom: 2016 },
      { name: "ET35",    type: "MINI_EXCAVATOR", yearFrom: 2016 },
      { name: "ET65",    type: "MINI_EXCAVATOR", yearFrom: 2017 },
      // Compactors
      { name: "DPU 110e", type: "COMPACTOR", yearFrom: 2019 },
      { name: "DPU 6055", type: "COMPACTOR", yearFrom: 2016 },
      { name: "DPU 6555", type: "COMPACTOR", yearFrom: 2016 },
      { name: "BPU 3750", type: "COMPACTOR", yearFrom: 2016 },
      { name: "RD 18",    type: "COMPACTOR", yearFrom: 2017 },
      { name: "RD 27-120", type: "COMPACTOR", yearFrom: 2017 },
    ],
  },
  {
    name: "Yanmar",
    slug: "yanmar",
    models: [
      { name: "SV08",    type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "SV17e",   type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "SV26",    type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "SV38",    type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "SV60",    type: "MINI_EXCAVATOR", yearFrom: 2018 },
      { name: "SV80",    type: "MINI_EXCAVATOR", yearFrom: 2019 },
      { name: "SV100",   type: "MINI_EXCAVATOR", yearFrom: 2020 },
    ],
  },
  {
    name: "Atlas Copco",
    slug: "atlas-copco",
    models: [
      { name: "LP 9-20E",   type: "COMPACTOR", yearFrom: 2016 },
      { name: "LG 400",     type: "COMPACTOR", yearFrom: 2016 },
      { name: "BEL 70",     type: "COMPACTOR", yearFrom: 2017 },
      { name: "LT 6005",    type: "COMPACTOR", yearFrom: 2017 },
    ],
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  let totalMakes = 0;
  let totalModels = 0;

  for (const make of MAKES_AND_MODELS) {
    const dbMake = await prisma.machineMake.upsert({
      where:  { slug: make.slug },
      update: { name: make.name },
      create: { name: make.name, slug: make.slug },
    });
    totalMakes++;

    for (const model of make.models) {
      await prisma.machineModel.upsert({
        where:  { makeId_name: { makeId: dbMake.id, name: model.name } },
        update: { type: model.type as any, series: model.series ?? null, yearFrom: model.yearFrom ?? null, yearTo: model.yearTo ?? null },
        create: {
          makeId:   dbMake.id,
          name:     model.name,
          type:     model.type as any,
          series:   model.series ?? null,
          yearFrom: model.yearFrom ?? null,
          yearTo:   model.yearTo ?? null,
        },
      });
      totalModels++;
    }

    console.log(`✓ ${make.name}: ${make.models.length} models`);
  }

  console.log(`\n✅ Seeded ${totalMakes} makes and ${totalModels} models`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
