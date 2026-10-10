// IDX swing screener (Phase 0). Bound to a Google Sheet.
// Prices: GOOGLEFINANCE. News: Google News RSS. Maths: Indicators.gs. News tagging: News.gs.
//
// Sheets (auto-created by Setup): Config, Universe, Themes, Screener, News.
// Menu "IDX Screener": Setup -> Refresh news -> Run screener -> Install triggers.

const CONFIG_DEFAULTS = [
  ['TARGET_PCT', 8, 'Return you want, in % (swing target)'],
  ['HORIZON_DAYS', 15, 'Trading days allowed to reach the target'],
  ['STOP_ATR_MULT', 2.5, 'Stop distance in ATRs (also used by the hit-rate backtest). Backtest: tight stops (1.5) kill the bounce edge'],
  ['MIN_VALUE_B', 5, 'Minimum average daily value traded, Rp billion (liquidity filter)'],
  ['HISTORY_DAYS', 400, 'Calendar days of price history to pull (~270 trading days)'],
  ['INDEX_SYMBOL', 'IDX:COMPOSITE', 'GOOGLEFINANCE symbol for IHSG. Blank = skip relative strength'],
  ['TOP_N', 10, 'How many picks to highlight / send to Telegram'],
];

// ticker, name, sector, aliases (comma-separated, used to match news headlines), active
const UNIVERSE_SEED = [
  ['BBCA', 'Bank Central Asia', 'Banking', 'BCA', 'Y'],
  ['BBRI', 'Bank Rakyat Indonesia', 'Banking', 'BRI', 'Y'],
  ['BMRI', 'Bank Mandiri', 'Banking', 'Mandiri', 'Y'],
  ['BBNI', 'Bank Negara Indonesia', 'Banking', 'BNI', 'Y'],
  ['BRIS', 'Bank Syariah Indonesia', 'Banking', 'BSI', 'Y'],
  ['TLKM', 'Telkom Indonesia', 'Telco', 'Telkom', 'Y'],
  ['ISAT', 'Indosat Ooredoo Hutchison', 'Telco', 'Indosat', 'Y'],
  ['ASII', 'Astra International', 'Automotive', 'Astra', 'Y'],
  ['ADRO', 'Alamtri Resources Indonesia', 'Energy', 'Adaro,Alamtri', 'Y'],
  ['PTBA', 'Bukit Asam', 'Energy', 'PTBA', 'Y'],
  ['PGAS', 'Perusahaan Gas Negara', 'Energy', 'PGN', 'Y'],
  ['MEDC', 'Medco Energi', 'Energy', 'Medco', 'Y'],
  ['AMMN', 'Amman Mineral', 'Mining', 'Amman', 'Y'],
  ['ANTM', 'Aneka Tambang', 'Metals', 'Antam', 'Y'],
  ['INCO', 'Vale Indonesia', 'Metals', 'Vale Indonesia', 'Y'],
  ['MDKA', 'Merdeka Copper Gold', 'Metals', 'Merdeka Copper', 'Y'],
  ['CPIN', 'Charoen Pokphand Indonesia', 'Poultry', 'Charoen', 'Y'],
  ['JPFA', 'Japfa Comfeed', 'Poultry', 'Japfa', 'Y'],
  ['ICBP', 'Indofood CBP', 'Consumer', 'Indofood CBP', 'Y'],
  ['INDF', 'Indofood Sukses Makmur', 'Consumer', 'Indofood', 'Y'],
  ['UNVR', 'Unilever Indonesia', 'Consumer', 'Unilever', 'Y'],
  ['KLBF', 'Kalbe Farma', 'Healthcare', 'Kalbe', 'Y'],
  ['GOTO', 'GoTo Gojek Tokopedia', 'Tech', 'GoTo', 'Y'],
  ['JSMR', 'Jasa Marga', 'Construction', 'Jasa Marga', 'Y'],
  ['SMGR', 'Semen Indonesia', 'Construction', 'Semen Indonesia', 'Y'],
  ['BSDE', 'Bumi Serpong Damai', 'Property', 'BSD', 'Y'],
  ['CTRA', 'Ciputra Development', 'Property', 'Ciputra', 'Y'],
  ['TPIA', 'Chandra Asri Pacific', 'Chemicals', 'Chandra Asri', 'Y'],
  ['BUMI', 'Bumi Resources', 'Energy', '', 'Y'],
  ['DSSA', 'Dian Swastatika Sentosa', 'Energy', '', 'Y'],
  ['CUAN', 'Petrindo Jaya Kreasi', 'Energy', 'Petrindo', 'Y'],
  ['BRMS', 'Bumi Resources Minerals', 'Mining', '', 'Y'],
  ['PTRO', 'Petrosea', 'Energy', '', 'Y'],
  ['BRPT', 'Barito Pacific', 'Energy', '', 'Y'],
  ['TINS', 'Timah', 'Metals', '', 'Y'],
  ['INET', 'Sinergi Inti Andalan Prima', 'Tech', 'Sinergi Inti', 'Y'],
  ['ENRG', 'Energi Mega Persada', 'Energy', '', 'Y'],
  ['UNTR', 'United Tractors', 'Energy', '', 'Y'],
  ['BREN', 'Barito Renewables Energy', 'Energy', 'Barito Renewables', 'Y'],
  ['RAJA', 'Rukun Raharja', 'Energy', '', 'Y'],
  ['KIJA', 'Kawasan Industri Jababeka', 'Property', 'Jababeka', 'Y'],
  ['INDY', 'Indika Energy', 'Energy', '', 'Y'],
  ['ESSA', 'ESSA Industries Indonesia', 'Energy', 'ESSA', 'Y'],
  ['MBMA', 'Merdeka Battery Materials', 'Metals', 'Merdeka Battery', 'Y'],
  ['ERAA', 'Erajaya Swasembada', 'Retail', 'Erajaya', 'Y'],
  ['WIFI', 'Solusi Sinergi Digital', 'Telco', '', 'Y'],
  ['ADMR', 'Alamtri Minerals Indonesia', 'Energy', 'Adaro Minerals', 'Y'],
  ['JARR', 'Jhonlin Agro Raya', 'Plantation', 'Jhonlin', 'Y'],
  ['AMRT', 'Sumber Alfaria Trijaya', 'Retail', 'Alfamart', 'Y'],
  ['PSAB', 'J Resources Asia Pasifik', 'Mining', 'J Resources', 'Y'],
  ['NCKL', 'Trimegah Bangun Persada', 'Metals', 'Harita Nickel', 'Y'],
  ['TAPG', 'Triputra Agro Persada', 'Plantation', '', 'Y'],
  ['INKP', 'Indah Kiat Pulp & Paper', 'Chemicals', 'Indah Kiat', 'Y'],
  ['ITMG', 'Indo Tambangraya Megah', 'Energy', 'Indo Tambangraya', 'Y'],
  ['GGRM', 'Gudang Garam', 'Consumer', '', 'Y'],
  ['AKRA', 'AKR Corporindo', 'Energy', 'AKR', 'Y'],
  ['TOWR', 'Sarana Menara Nusantara', 'Telco', 'Sarana Menara', 'Y'],
  ['EMTK', 'Elang Mahkota Teknologi', 'Tech', 'Emtek', 'Y'],
  ['PGEO', 'Pertamina Geothermal Energy', 'Energy', 'Pertamina Geothermal', 'Y'],
  ['TKIM', 'Pabrik Kertas Tjiwi Kimia', 'Chemicals', 'Tjiwi Kimia', 'Y'],
  ['ULTJ', 'Ultrajaya Milk Industry', 'Consumer', 'Ultrajaya', 'Y'],
  ['BYAN', 'Bayan Resources', 'Energy', 'Bayan', 'Y'],
  ['BBTN', 'Bank Tabungan Negara', 'Banking', 'BTN', 'Y'],
  ['EXCL', 'XLSmart Telecom Sejahtera', 'Telco', 'XL Axiata,XLSmart', 'Y'],
  ['MAPI', 'Mitra Adiperkasa', 'Retail', '', 'Y'],
  ['MYOR', 'Mayora Indah', 'Consumer', 'Mayora', 'Y'],
  ['ARTO', 'Bank Jago', 'Banking', 'Jago', 'Y'],
  ['MTEL', 'Dayamitra Telekomunikasi', 'Telco', 'Mitratel', 'Y'],
  ['BUKA', 'Bukalapak', 'Tech', '', 'Y'],
  ['LSIP', 'PP London Sumatra Indonesia', 'Plantation', 'London Sumatra', 'Y'],
  ['ELSA', 'Elnusa', 'Energy', '', 'Y'],
  ['HRUM', 'Harum Energy', 'Energy', '', 'Y'],
  ['MAPA', 'Map Aktif Adiperkasa', 'Retail', '', 'Y'],
  ['AALI', 'Astra Agro Lestari', 'Plantation', '', 'Y'],
  ['HMSP', 'HM Sampoerna', 'Consumer', 'Sampoerna', 'Y'],
  ['CMRY', 'Cisarua Mountain Dairy', 'Consumer', 'Cimory', 'Y'],
  ['HEAL', 'Medikaloka Hermina', 'Healthcare', 'Hermina', 'Y'],
  ['PWON', 'Pakuwon Jati', 'Property', 'Pakuwon', 'Y'],
  ['MNCN', 'Media Nusantara Citra', 'Media', '', 'Y'],
  ['SCMA', 'Surya Citra Media', 'Media', '', 'Y'],
  ['AUTO', 'Astra Otoparts', 'Automotive', '', 'Y'],
  ['SIDO', 'Industri Jamu dan Farmasi Sido Muncul', 'Consumer', 'Sido Muncul', 'Y'],
  ['BDMN', 'Bank Danamon Indonesia', 'Banking', 'Danamon', 'Y'],
  ['SMRA', 'Summarecon Agung', 'Property', 'Summarecon', 'Y'],
  ['DSNG', 'Dharma Satya Nusantara', 'Plantation', '', 'Y'],
  ['BBHI', 'Allo Bank Indonesia', 'Banking', 'Allo Bank', 'Y'],
  ['MIKA', 'Mitra Keluarga Karyasehat', 'Healthcare', 'Mitra Keluarga', 'Y'],
  ['BSSR', 'Baramulti Suksessarana', 'Energy', 'Baramulti', 'Y'],
  ['INTP', 'Indocement Tunggal Prakarsa', 'Construction', 'Indocement', 'Y'],
  ['SMDR', 'Samudera Indonesia', 'Industrial', '', 'Y'],
  ['PNLF', 'Panin Financial', 'Banking', '', 'Y'],
  ['ACES', 'Aspirasi Hidup Indonesia', 'Retail', 'Ace Hardware', 'Y'],
  ['ASSA', 'Adi Sarana Armada', 'Industrial', '', 'Y'],
  ['DEWA', 'Darma Henwa', 'Energy', '', 'Y'],
  ['SSIA', 'Surya Semesta Internusa', 'Property', '', 'Y'],
  ['BFIN', 'BFI Finance Indonesia', 'Banking', 'BFI Finance', 'Y'],
  ['SRTG', 'Saratoga Investama Sedaya', 'Industrial', 'Saratoga', 'Y'],
  ['TOBA', 'TBS Energi Utama', 'Energy', 'TBS Energi', 'Y'],
  ['BMTR', 'Global Mediacom', 'Media', 'Global Mediacom', 'Y'],
  ['NISP', 'Bank OCBC NISP', 'Banking', '', 'Y'],
  // ---- expansion 2026-10-10: the next 200 by median traded value (tools/expand-universe.mjs) ----
  ['BNBR', 'Bakrie & Brothers', 'Industrial', '', 'Y'], // Conglomerates
  ['EMAS', 'Merdeka Gold Resources', 'Metals', '', 'Y'], // Gold
  ['BUVA', 'Bukit Uluwatu Villa', 'Industrial', '', 'Y'], // Lodging
  ['BULL', 'Buana Lintas Lautan', 'Industrial', '', 'Y'], // Marine Shipping
  ['AADI', 'Adaro Andalan Indonesia', 'Energy', '', 'Y'], // Thermal Coal
  ['BIPI', 'Astrindo Nusantara Infrastruktur', 'Energy', '', 'Y'], // Thermal Coal
  ['VKTR', 'VKTR Teknologi Mobilitas', 'Industrial', '', 'Y'], // Recreational Vehicles
  ['KOTA', 'DMS Propertindo', 'Property', '', 'Y'], // Real Estate Services
  ['ARCI', 'Archi Indonesia', 'Metals', '', 'Y'], // Gold
  ['CDIA', 'Chandra Daya Investasi', 'Energy', '', 'Y'], // Utilities—Regulated Electric
  ['RATU', 'Raharja Energi Cepu', 'Energy', '', 'Y'], // Oil & Gas E&P
  ['RMKE', 'RMK Energy', 'Energy', '', 'Y'], // Thermal Coal
  ['PANI', 'Pantai Indah Kapuk Dua', 'Property', '', 'Y'], // Real Estate—Development
  ['COCO', 'Wahana Interfood Nusantara', 'Consumer', '', 'Y'], // Confectioners
  ['IMPC', 'Impack Pratama Industri', 'Construction', '', 'Y'], // Building Products & Equipment
  ['TCPI', 'Transcoal Pacific', 'Industrial', '', 'Y'], // Marine Shipping
  ['HRTA', 'Hartadinata Abadi', 'Retail', '', 'Y'], // Luxury Goods
  ['KETR', 'Ketrosden Triasmitra', 'Telco', '', 'Y'], // Communication Equipment
  ['MINA', 'Sanurhasta Mitra', 'Industrial', '', 'Y'], // Lodging
  ['IRSX', 'Folago Global Nusantara', 'Tech', '', 'Y'], // Software—Application
  ['ARKO', 'Arkora Hydro', 'Energy', '', 'Y'], // Utilities—Renewable
  ['GULA', 'Aman Agrindo', 'Plantation', '', 'Y'], // Farm Products
  ['DMAS', 'Puradelta Lestari', 'Property', '', 'Y'], // Real Estate—Development
  ['MARK', 'Mark Dynamics Indonesia', 'Healthcare', '', 'Y'], // Medical Instruments & Supplies
  ['CMNT', 'Cemindo Gemilang', 'Construction', '', 'Y'], // Building Materials
  ['CYBR', 'ITSEC Asia', 'Tech', '', 'Y'], // Software—Infrastructure
  ['MSIN', 'MNC Digital Entertainment', 'Media', '', 'Y'], // Entertainment
  ['BKSL', 'Sentul City', 'Property', '', 'Y'], // Real Estate—Development
  ['AYAM', 'Janu Putra Sejahtera', 'Poultry', '', 'Y'], // Farm Products
  ['IATA', 'MNC Energy Investments', 'Energy', '', 'Y'], // Thermal Coal
  ['SUPA', 'Super Bank Indonesia', 'Banking', '', 'Y'], // Banks—Regional
  ['NICL', 'PAM Mineral', 'Metals', '', 'Y'], // Other Industrial Metals & Mining
  ['OASA', 'Maharaksa Biru Energi', 'Construction', '', 'Y'], // Engineering & Construction
  ['CBRE', 'Cakra Buana Resources Energi', 'Industrial', '', 'Y'], // Marine Shipping
  ['BWPT', 'Eagle High Plantations', 'Plantation', '', 'Y'], // Packaged Foods
  ['SSMS', 'Sawit Sumbermas Sarana', 'Plantation', '', 'Y'], // Packaged Foods
  ['FILM', 'MD Entertainment', 'Media', '', 'Y'], // Entertainment
  ['UVCR', 'Trimegah Karya Pratama', 'Tech', '', 'Y'], // Software—Application
  ['SMIL', 'Sarana Mitra Luas', 'Industrial', '', 'Y'], // Rental & Leasing Services
  ['CBDK', 'Bangun Kosambi Sukses', 'Property', '', 'Y'], // Real Estate Services
  ['COIN', 'Indokripto Koin Semesta', 'Banking', '', 'Y'], // Financial Data & Stock Exchanges
  ['FUTR', 'Futura Energi Global', 'Energy', '', 'Y'], // Utilities—Renewable
  ['SIMP', 'Salim Ivomas Pratama', 'Plantation', '', 'Y'], // Packaged Foods
  ['DEWI', 'Dewi Shri Farmindo', 'Plantation', '', 'Y'], // Farm Products
  ['HATM', 'Habco Trans Maritima', 'Industrial', '', 'Y'], // Marine Shipping
  ['SGER', 'Sumber Global Energy', 'Energy', '', 'Y'], // Thermal Coal
  ['RSCH', 'Charlie Hospital Semarang', 'Healthcare', '', 'Y'], // Medical Care Facilities
  ['SOCI', 'Soechi Lines', 'Industrial', '', 'Y'], // Marine Shipping
  ['KEEN', 'Kencana Energi Lestari', 'Energy', '', 'Y'], // Utilities—Independent Power Producers
  ['HUMI', 'Humpuss Maritim Internasional', 'Industrial', '', 'Y'], // Marine Shipping
  ['BSML', 'Bintang Samudera Mandiri Lines', 'Industrial', '', 'Y'], // Marine Shipping
  ['MSJA', 'Multi Spunindo Jaya', 'Chemicals', '', 'Y'], // Textile Manufacturing
  ['OMED', 'Jayamas Medica Industri', 'Healthcare', '', 'Y'], // Medical Instruments & Supplies
  ['FORE', 'Fore Kopi Indonesia', 'Consumer', '', 'Y'], // Restaurants
  ['PIPA', 'Oxala Energy International', 'Construction', '', 'Y'], // Building Products & Equipment
  ['BBYB', 'Bank Neo Commerce', 'Banking', '', 'Y'], // Banks—Regional
  ['GPRA', 'Perdana Gapuraprima', 'Property', '', 'Y'], // Real Estate—Development
  ['STAA', 'Sumber Tani Agung Resources', 'Plantation', '', 'Y'], // Farm Products
  ['NSSS', 'Nusantara Sawit Sejahtera', 'Plantation', '', 'Y'], // Farm Products
  ['GJTL', 'Gajah Tunggal', 'Automotive', '', 'Y'], // Auto Parts
  ['ASPR', 'Asia Pramulia', 'Chemicals', '', 'Y'], // Packaging & Containers
  ['HOPE', 'Harapan Duta Pertiwi', 'Metals', '', 'Y'], // Metal Fabrication
  ['GPSO', 'Geoprima Solusi', 'Tech', '', 'Y'], // Scientific & Technical Instruments
  ['GTSI', 'GTS Internasional', 'Industrial', '', 'Y'], // Marine Shipping
  ['INDO', 'Royalindo Investa Wijaya', 'Industrial', '', 'Y'], // Lodging
  ['MBSS', 'Mitrabahtera Segara Sejati', 'Industrial', '', 'Y'], // Marine Shipping
  ['BNGA', 'Bank CIMB Niaga', 'Banking', '', 'Y'], // Banks—Regional
  ['PADA', 'Personel Alih Daya', 'Industrial', '', 'Y'], // Staffing & Employment Services
  ['PKPK', 'Paragon Karya Perkasa', 'Construction', '', 'Y'], // Engineering & Construction
  ['AVIA', 'Avia Avian', 'Chemicals', '', 'Y'], // Specialty Chemicals
  ['SRSN', 'Indo Acidatama', 'Chemicals', '', 'Y'], // Chemicals
  ['DATA', 'Remala Abadi', 'Telco', '', 'Y'], // Telecom Services
  ['DKFT', 'Central Omega Resources', 'Metals', '', 'Y'], // Other Industrial Metals & Mining
  ['YELO', 'Yelooo Integra Datanet', 'Industrial', '', 'Y'], // Travel Services
  ['GMFI', 'Garuda Maintenance Facility', 'Industrial', '', 'Y'], // Aerospace & Defense
  ['APLN', 'Agung Podomoro Land', 'Property', '', 'Y'], // Real Estate—Development
  ['DGWG', 'Delta Giri Wacana', 'Chemicals', '', 'Y'], // Agricultural Inputs
  ['TOTL', 'Total Bangun Persada', 'Construction', '', 'Y'], // Engineering & Construction
  ['WIRG', 'WIR Asia', 'Tech', '', 'Y'], // Information Technology Services
  ['POWR', 'Cikarang Listrindo', 'Energy', '', 'Y'], // Utilities—Independent Power Producers
  ['GIAA', 'Garuda Indonesia', 'Industrial', '', 'Y'], // Airlines
  ['ESIP', 'Sinergi Inti Plastindo', 'Chemicals', '', 'Y'], // Packaging & Containers
  ['DEFI', 'Danasupra Erapacific', 'Banking', '', 'Y'], // Credit Services
  ['PPRE', 'PP Presisi', 'Construction', '', 'Y'], // Engineering & Construction
  ['PYFA', 'Pyridam Farma', 'Healthcare', '', 'Y'], // Drug Manufacturers—Specialty & Generic
  ['BJTM', 'Bank Jatim', 'Banking', '', 'Y'], // Banks—Regional
  ['BTPS', 'Bank BTPN Syariah', 'Banking', '', 'Y'], // Banks—Regional
  ['KAQI', 'Jantra Grupo Indonesia', 'Automotive', '', 'Y'], // Auto Parts
  ['SNLK', 'Sunter Lakeside Hotel', 'Industrial', '', 'Y'], // Lodging
  ['TRIN', 'Perintis Triniti Properti', 'Property', '', 'Y'], // Real Estate—Development
  ['NRCA', 'Nusa Raya Cipta', 'Construction', '', 'Y'], // Engineering & Construction
  ['SMSM', 'Selamat Sempurna', 'Automotive', '', 'Y'], // Auto Parts
  ['RLCO', 'Abadi Lestari Indonesia', 'Plantation', '', 'Y'], // Farm Products
  ['MEDS', 'Hetzer Medical Indonesia', 'Healthcare', '', 'Y'], // Medical Instruments & Supplies
  ['LUCY', 'Lima Dua Lima Tiga', 'Consumer', '', 'Y'], // Restaurants
  ['MPMX', 'Mitra Pinasthika Mustika', 'Automotive', '', 'Y'], // Auto & Truck Dealerships
  ['NTBK', 'Nusatama Berkah', 'Construction', '', 'Y'], // Farm & Heavy Construction Machinery
  ['MGLV', 'NexAI Digital Infrastruktur', 'Consumer', '', 'Y'], // Furnishings, Fixtures & Appliances
  ['PSKT', 'Red Planet Indonesia', 'Industrial', '', 'Y'], // Lodging
  ['EPAC', 'Megalestari Epack Sentosaraya', 'Chemicals', '', 'Y'], // Packaging & Containers
  ['MGRO', 'Mahkota Group', 'Consumer', '', 'Y'], // Packaged Foods
  ['BEEF', 'Estika Tata Tiara', 'Consumer', '', 'Y'], // Packaged Foods
  ['CLEO', 'Sariguna Primatirta', 'Consumer', '', 'Y'], // Beverages—Non-Alcoholic
  ['GZCO', 'Gozco Plantations', 'Plantation', '', 'Y'], // Farm Products
  ['WIIM', 'Wismilak Inti Makmur', 'Consumer', '', 'Y'], // Tobacco
  ['TUGU', 'Asuransi Tugu Pratama Indonesia', 'Banking', '', 'Y'], // Insurance—Diversified
  ['MEJA', 'Harta Djaya Karya', 'Construction', '', 'Y'], // Engineering & Construction
  ['BJBR', 'Bank BJB', 'Banking', '', 'Y'], // Banks—Regional
  ['BELL', 'Trisula Textile Industries', 'Chemicals', '', 'Y'], // Textile Manufacturing
  ['LEAD', 'Logindo Samudramakmur', 'Industrial', '', 'Y'], // Marine Shipping
  ['NEST', 'Esta Indonesia', 'Plantation', '', 'Y'], // Farm Products
  ['LPPF', 'MDS Retailing', 'Retail', '', 'Y'], // Department Stores
  ['LAPD', 'Leyand International', 'Energy', '', 'Y'], // Utilities—Independent Power Producers
  ['PNBN', 'Bank Pan Indonesia', 'Banking', '', 'Y'], // Banks—Regional
  ['RMKO', 'Royaltama Mulia Kontraktorindo', 'Energy', '', 'Y'], // Thermal Coal
  ['APEX', 'Apexindo Pratama Duta', 'Energy', '', 'Y'], // Oil & Gas Drilling
  ['KRYA', 'Bangun Karya Perkasa Jaya', 'Construction', '', 'Y'], // Engineering & Construction
  ['BDKR', 'Berdikari Pondasi Perkasa', 'Construction', '', 'Y'], // Engineering & Construction
  ['MORA', 'Mora Telematika Indonesia', 'Telco', '', 'Y'], // Telecom Services
  ['ASGR', 'Astra Graphia', 'Industrial', '', 'Y'], // Specialty Business Services
  ['MLPL', 'Multipolar', 'Retail', '', 'Y'], // Department Stores
  ['MIDI', 'Midi Utama Indonesia', 'Retail', '', 'Y'], // Grocery Stores
  ['AHAP', 'Asuransi Harta Aman Pratama', 'Banking', '', 'Y'], // Insurance—Property & Casualty
  ['UDNG', 'Agro Bahari Nusantara', 'Plantation', '', 'Y'], // Farm Products
  ['ICON', 'Island Concepts Indonesia', 'Energy', '', 'Y'], // Oil & Gas Equipment & Services
  ['DPUM', 'Dua Putra Utama Makmur', 'Consumer', '', 'Y'], // Packaged Foods
  ['LAND', 'Trimitra Propertindo', 'Property', '', 'Y'], // Real Estate Services
  ['TOOL', 'Rohartindo Nusantara Luas', 'Consumer', '', 'Y'], // Furnishings, Fixtures & Appliances
  ['SMLE', 'Sinergi Multi Lestarindo', 'Chemicals', '', 'Y'], // Specialty Chemicals
  ['FPNI', 'Lotte Chemical Titan', 'Chemicals', '', 'Y'], // Specialty Chemicals
  ['ARNA', 'Arwana Citramulia', 'Construction', '', 'Y'], // Building Products & Equipment
  ['KOCI', 'Kokoh Exa Nusantara', 'Property', '', 'Y'], // Real Estate—Development
  ['KOKA', 'Koka Indonesia', 'Construction', '', 'Y'], // Engineering & Construction
  ['KUAS', 'Ace Oldfields', 'Construction', '', 'Y'], // Building Products & Equipment
  ['NZIA', 'Nusantara Almazia', 'Property', '', 'Y'], // Real Estate—Development
  ['SLIS', 'Gaya Abadi Sempurna', 'Tech', '', 'Y'], // Electronics & Computer Distribution
  ['OILS', 'Indo Oil Perkasa', 'Consumer', '', 'Y'], // Packaged Foods
  ['TSPC', 'Tempo Scan Pacific', 'Healthcare', '', 'Y'], // Conglomerates
  ['MLPT', 'Multipolar Technology', 'Tech', '', 'Y'], // Information Technology Services
  ['LAJU', 'Jasa Berdikari Logistics', 'Industrial', '', 'Y'], // Integrated Freight & Logistics
  ['PRDA', 'Prodia Widyahusada', 'Healthcare', '', 'Y'], // Diagnostics & Research
  ['CNMA', 'Nusantara Sejahtera Raya', 'Media', '', 'Y'], // Entertainment
  ['ABMM', 'ABM Investama', 'Energy', '', 'Y'], // Thermal Coal
  ['DILD', 'Intiland Development', 'Property', '', 'Y'], // Real Estate—Development
  ['KIOS', 'Kioson Komersial Indonesia', 'Tech', '', 'Y'], // Software—Application
  ['ERAL', 'Sinar Eka Selaras', 'Retail', '', 'Y'], // Specialty Retail
  ['SDMU', 'Sidomulyo Selaras', 'Industrial', '', 'Y'], // Trucking
  ['MSTI', 'Mastersystem Infotama', 'Tech', '', 'Y'], // Information Technology Services
  ['ENZO', 'Morenzo Abadi Perkasa', 'Consumer', '', 'Y'], // Packaged Foods
  ['VERN', 'Verona Indah Pictures', 'Media', '', 'Y'], // Entertainment
  ['BIRD', 'Blue Bird', 'Industrial', '', 'Y'], // Railroads
  ['DFAM', 'Dafam Property Indonesia', 'Property', '', 'Y'], // Real Estate Services
  ['MOLI', 'Madusari Murni Indah', 'Chemicals', '', 'Y'], // Chemicals
  ['KBLV', 'First Media', 'Media', '', 'Y'], // Entertainment
  ['PEGE', 'Panca Global Kapital', 'Banking', '', 'Y'], // Capital Markets
  ['UNTD', 'Terang Dunia Internusa', 'Automotive', '', 'Y'], // Auto Manufacturers
  ['WGSH', 'Wira Global Solusi', 'Tech', '', 'Y'], // Software—Infrastructure
  ['KDTN', 'Puri Sentul Permai', 'Consumer', '', 'Y'], // Restaurants
  ['KRAS', 'Krakatau Steel', 'Metals', '', 'Y'], // Steel
  ['SOFA', 'Solusi Environment Asia', 'Energy', '', 'Y'], // Utilities—Renewable
  ['VTNY', 'Venteny Fortuna International', 'Industrial', '', 'Y'], // Staffing & Employment Services
  ['JATI', 'Informasi Teknologi Indonesia', 'Tech', '', 'Y'], // Information Technology Services
  ['NAYZ', 'Hassana Boga Sejahtera', 'Consumer', '', 'Y'], // Packaged Foods
  ['TBLA', 'Tunas Baru Lampung', 'Plantation', '', 'Y'], // Packaged Foods
  ['PTPP', 'Pembangunan Perumahan', 'Construction', '', 'Y'], // Engineering & Construction
  ['FUJI', 'Fuji Finance Indonesia', 'Banking', '', 'Y'], // Credit Services
  ['FOLK', 'Multi Garam Utama', 'Retail', '', 'Y'], // Internet Retail
  ['RALS', 'Ramayana Lestari Sentosa', 'Retail', '', 'Y'], // Department Stores
  ['RISE', 'Jaya Sukses Makmur Sentosa', 'Property', '', 'Y'], // Real Estate—Development
  ['BEST', 'Bekasi Fajar Industrial Estate', 'Property', '', 'Y'], // Real Estate—Development
  ['ELPI', 'Pelayaran Nasional Ekalya Purnamasari', 'Industrial', '', 'Y'], // Marine Shipping
  ['NOBU', 'Bank Nationalnobu', 'Banking', '', 'Y'], // Banks—Regional
  ['LABA', 'Green Power Group', 'Metals', '', 'Y'], // Steel
  ['DIVA', 'Distribusi Voucher Nusantara', 'Tech', '', 'Y'], // Software—Application
  ['ASRI', 'Alam Sutera Realty', 'Industrial', '', 'Y'], // industry n/a
  ['KJEN', 'Krida Jaringan Nusantara', 'Industrial', '', 'Y'], // Integrated Freight & Logistics
  ['BLUE', 'Berkah Prima Perkasa', 'Tech', '', 'Y'], // Electronics & Computer Distribution
  ['MAIN', 'Malindo Feedmill', 'Poultry', '', 'Y'], // Packaged Foods
  ['VISI', 'Satu Visi Putra', 'Industrial', '', 'Y'], // Industrial Distribution
  ['TRON', 'Teknologi Karya Digital Nusa', 'Tech', '', 'Y'], // Information Technology Services
  ['HEXA', 'Hexindo Adiperkasa', 'Industrial', '', 'Y'], // Industrial Distribution
  ['PBSA', 'Paramita Bangun Sarana', 'Construction', '', 'Y'], // Engineering & Construction
  ['NINE', 'Techno9 Indonesia', 'Tech', '', 'Y'], // Information Technology Services
  ['NIKL', 'Pelat Timah Nusantara', 'Metals', '', 'Y'], // Metal Fabrication
  ['DAAZ', 'Daaz Bara Lestari', 'Metals', '', 'Y'], // Other Industrial Metals & Mining
  ['TBIG', 'Tower Bersama Infrastructure', 'Telco', '', 'Y'], // Telecom Services
  ['TMPO', 'Tempo Inti Media', 'Media', '', 'Y'], // Publishing
  ['PART', 'Cipta Perdana Lancar', 'Automotive', '', 'Y'], // Auto Parts
  ['CHEM', 'Chemstar Indonesia', 'Chemicals', '', 'Y'], // Specialty Chemicals
  ['MTDL', 'Metrodata Electronics', 'Tech', '', 'Y'], // Electronics & Computer Distribution
  ['TOSK', 'Topindo Solusi Komunika', 'Tech', '', 'Y'], // Software—Application
  ['BIPP', 'Bhuwanatala Indah Permai', 'Property', '', 'Y'], // Real Estate—Diversified
  ['ADES', 'Akasha Wira International', 'Consumer', '', 'Y'], // Beverages—Non-Alcoholic
  ['HAJJ', 'Arsy Buana Travelindo', 'Industrial', '', 'Y'], // Travel Services
  ['MKPI', 'Metropolitan Kentjana', 'Property', '', 'Y'], // Real Estate Services
  ['WINS', 'Wintermar Offshore Marine', 'Industrial', '', 'Y'], // Marine Shipping
  ['PSDN', 'Prasidha Aneka Niaga', 'Consumer', '', 'Y'], // Packaged Foods
  ['ELIT', 'Data Sinergitama Jaya', 'Tech', '', 'Y'], // Information Technology Services
  ['TPMA', 'Trans Power Marine', 'Industrial', '', 'Y'], // Marine Shipping
  ['WOWS', 'Ginting Jaya Energi', 'Energy', '', 'Y'], // Oil & Gas Equipment & Services
];

const SCREENER_HEADERS = ['Rank', 'Ticker', 'Name', 'Sector', 'Action', 'Score', 'Setup', 'Close', '1D %', '5D %', 'RSI',
  'ATRs vs SMA20', 'Support', 'Resistance', 'Entry', 'Stop', 'Target', 'Bounce target (SMA20)', 'R/R', 'News', 'Top headline (link)', 'Narrative'];

// ---------- menu & setup ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('IDX Screener')
    .addItem('1. Setup sheets', 'setup')
    .addItem('2. Refresh news', 'refreshNewsUi_')
    .addItem('3. Run screener', 'runScreener')
    .addItem('Install daily triggers', 'installTriggers')
    .addToUi();
}

function setup() {
  const cfg = sheet_('Config', ['Key', 'Value', 'Note']);
  if (cfg.getLastRow() < 2) cfg.getRange(2, 1, CONFIG_DEFAULTS.length, 3).setValues(CONFIG_DEFAULTS);
  const uni = sheet_('Universe', ['Ticker', 'Name', 'Sector', 'Aliases', 'Active']);
  if (uni.getLastRow() < 2) uni.getRange(2, 1, UNIVERSE_SEED.length, 5).setValues(UNIVERSE_SEED);
  ensureThemes_();
  sheet_('News', NEWS_HEADERS);
  sheet_('Screener', SCREENER_HEADERS);
  SpreadsheetApp.getActive().toast('Sheets ready. Edit Config / Universe / Themes, then run News and Screener.');
}

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (name === 'Screener') {
      sh.getRange(2, 1, 1, headers.length).setValues([headers]);
      sh.getRange(2, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
      sh.setFrozenRows(2);
    } else {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function readConfig_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Config');
  if (!sh) throw new Error('Run "1. Setup sheets" first.');
  const m = {};
  sh.getDataRange().getValues().slice(1).forEach(r => { if (r[0]) m[r[0]] = r[1]; });
  const num = (k, d) => (m[k] === '' || m[k] === undefined ? d : Number(m[k]));
  return {
    targetPct: num('TARGET_PCT', 8), horizon: num('HORIZON_DAYS', 15), stopMult: num('STOP_ATR_MULT', 2.5),
    minValueB: num('MIN_VALUE_B', 5), historyDays: num('HISTORY_DAYS', 400), topN: num('TOP_N', 10),
    indexSymbol: String(m.INDEX_SYMBOL || '').trim(),
  };
}

function readUniverse_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Universe');
  if (!sh) throw new Error('Run "1. Setup sheets" first.');
  return sh.getDataRange().getValues().slice(1)
    .filter(r => r[0] && String(r[4]).toUpperCase() !== 'N')
    .map(r => ({
      ticker: String(r[0]).trim().toUpperCase(), name: String(r[1]).trim(), sector: String(r[2]).trim(),
      aliases: String(r[3] || '').split(',').map(s => s.trim()).filter(Boolean),
    }));
}

// ---------- prices via GOOGLEFINANCE ----------

// Writes GOOGLEFINANCE formulas into a scratch sheet in blocks of 7 columns, waits, reads them back.
// symbols: ['IDX:BBCA', ...]  ->  {symbol: bars | null}
function fetchBars_(symbols, historyDays) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('_fetch');
  if (!sh) sh = ss.insertSheet('_fetch');
  sh.hideSheet();
  const BLOCK = 7, BATCH = 8;
  const out = {};
  const start = new Date(Date.now() - historyDays * 86400000);
  const startExpr = 'DATE(' + start.getFullYear() + ',' + (start.getMonth() + 1) + ',' + start.getDate() + ')';

  for (let b0 = 0; b0 < symbols.length; b0 += BATCH) {
    const batch = symbols.slice(b0, b0 + BATCH);
    sh.clear();
    const needCols = batch.length * BLOCK;
    if (sh.getMaxColumns() < needCols) sh.insertColumnsAfter(sh.getMaxColumns(), needCols - sh.getMaxColumns());
    batch.forEach((sym, i) => {
      sh.getRange(1, i * BLOCK + 1).setFormula('=GOOGLEFINANCE("' + sym + '","all",' + startExpr + ',TODAY(),"DAILY")');
    });
    SpreadsheetApp.flush();
    for (let tries = 0; tries < 12; tries++) {
      const heads = batch.map((s, i) => sh.getRange(1, i * BLOCK + 1).getDisplayValue());
      if (!heads.some(h => h === 'Loading...')) break;
      Utilities.sleep(1500);
    }
    const lastRow = Math.max(sh.getLastRow(), 2);
    const vals = sh.getRange(1, 1, lastRow, needCols).getValues();
    batch.forEach((sym, i) => { out[sym] = parseBars_(vals, i * BLOCK); });
  }
  return out;
}

// Reads one GOOGLEFINANCE block (header + rows of Date,Open,High,Low,Close,Volume).
function parseBars_(vals, col) {
  const bars = { d: [], o: [], h: [], l: [], c: [], v: [] };
  for (let r = 1; r < vals.length; r++) {
    const row = vals[r].slice(col, col + 6);
    if (!(row[0] instanceof Date)) continue;
    const nums = row.slice(1).map(Number);
    if (nums.some(x => isNaN(x)) || nums[3] <= 0) continue; // c = nums[3]
    bars.d.push(row[0]); bars.o.push(nums[0]); bars.h.push(nums[1]);
    bars.l.push(nums[2]); bars.c.push(nums[3]); bars.v.push(nums[4]);
  }
  return bars.c.length ? bars : null;
}

// ---------- main run ----------

function runScreener() {
  const cfg = readConfig_();
  const uni = readUniverse_();
  const symbols = uni.map(u => 'IDX:' + u.ticker);
  if (cfg.indexSymbol) symbols.push(cfg.indexSymbol);
  const bars = fetchBars_(symbols, cfg.historyDays);
  const idx = cfg.indexSymbol && bars[cfg.indexSymbol] ? bars[cfg.indexSymbol].c : null;
  const news = newsScores_(uni);

  const picks = [], skipped = [];
  uni.forEach(u => {
    const b = bars['IDX:' + u.ticker];
    if (!b) { skipped.push(u.ticker + ' (no data)'); return; }
    const a = analyse_(b, idx, cfg);
    if (!a) { skipped.push(u.ticker + ' (short history)'); return; }
    if (a.avgValue / 1e9 < cfg.minValueB) { skipped.push(u.ticker + ' (illiquid)'); return; }
    picks.push(buildPick_(u, b, a, news[u.ticker], null, cfg));
  });
  picks.sort((x, y) => y.score - x.score);
  const market = marketRead_(picks, idx);

  const stamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'EEE dd MMM yyyy HH:mm') + ' WIB';
  writeScreenerSheet_(picks, market, cfg, skipped, stamp);
  saveState_({
    meta: { generatedAt: new Date().toISOString(), engine: 'oversold-v2', actScore: ACT_SCORE, params: cfg, universe: uni.length, ranked: picks.length, skipped: skipped, sample: false, sources: { prices: 'GOOGLEFINANCE', news: 'Google News RSS', ownership: null } },
    market: market, picks: picks, news: newsForApi_(), ownership: null, backtest: null, forward: null,
  });
  SpreadsheetApp.getActive().toast('Screener updated: ' + picks.length + ' ranked, ' + skipped.length + ' skipped.');
  sendDigest_(picks, cfg, stamp);
}

function writeScreenerSheet_(picks, market, cfg, skipped, stamp) {
  const sh = sheet_('Screener', SCREENER_HEADERS);
  sh.getRange(3, 1, Math.max(sh.getLastRow(), 3), SCREENER_HEADERS.length).clearContent().clearFormat();
  sh.getRange(1, 1).setValue('Target +' + cfg.targetPct + '% in ' + cfg.horizon + 'd | stop ' + cfg.stopMult + ' ATR | ' + market.regime +
    ' (' + market.oversoldCount + '/' + market.of + ' oversold) | updated ' + stamp + (skipped.length ? ' | skipped: ' + skipped.join(', ') : ''));
  if (!picks.length) return;
  const data = picks.map((p, i) => {
    const h = p.headlines[0];
    const link = h ? '=HYPERLINK("' + String(h.link).replace(/"/g, '""') + '","' + ('[' + h.category + '] ' + h.title).replace(/"/g, '""') + '")' : '';
    return [i + 1, p.ticker, p.name, p.sector, p.action, p.score, p.setup, p.close, p.chg1d, p.chg5d,
      p.rsi === null ? '' : Math.round(p.rsi), p.dist20Atr, p.support, p.resistance, p.entry, p.stop, p.target,
      p.targetMR === null ? '' : p.targetMR, p.rr === null ? '' : p.rr, p.newsScore, link, p.narrative];
  });
  const n = data.length;
  sh.getRange(3, 1, n, SCREENER_HEADERS.length).setValues(data);
  sh.getRange(3, 8, n, 1).setNumberFormat('#,##0');
  sh.getRange(3, 9, n, 2).setNumberFormat('+0.0%;-0.0%;0.0%');
  sh.getRange(3, 12, n, 1).setNumberFormat('+0.0;-0.0;0.0');
  sh.getRange(3, 13, n, 6).setNumberFormat('#,##0');
  sh.getRange(3, 19, n, 1).setNumberFormat('0.0');
  sh.getRange(3, 20, n, 1).setNumberFormat('+0.0;-0.0;0.0');
  sh.getRange(3, 22, n, 1).setWrap(false);
  applyScreenerFormatting_(sh, n);
  sh.setFrozenRows(2);
  sh.setFrozenColumns(2);
}

function applyScreenerFormatting_(sh, n) {
  const R = SpreadsheetApp.InterpolationType.NUMBER;
  const score = SpreadsheetApp.newConditionalFormatRule().setGradientMaxpointWithValue('#34a853', R, '85')
    .setGradientMidpointWithValue('#fff2cc', R, '55').setGradientMinpointWithValue('#f4cccc', R, '25').setRanges([sh.getRange(3, 6, n, 1)]).build();
  const act = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('ACT').setBackground('#d9ead3').setBold(true).setRanges([sh.getRange(3, 5, n, 1)]).build();
  const skip = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('SKIP').setFontColor('#b91c1c').setRanges([sh.getRange(3, 5, n, 1)]).build();
  const pos = SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor('#15803d').setRanges([sh.getRange(3, 9, n, 2), sh.getRange(3, 20, n, 1)]).build();
  const neg = SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor('#b91c1c').setRanges([sh.getRange(3, 9, n, 2), sh.getRange(3, 20, n, 1)]).build();
  sh.setConditionalFormatRules([score, act, skip, pos, neg]);
}

// ---------- JSON API for the web app (same shape as the GitHub snapshot) ----------

// Latest payload lives in a hidden sheet, chunked because a cell holds ~50k characters.
function saveState_(obj) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('_state');
  if (!sh) sh = ss.insertSheet('_state');
  sh.hideSheet();
  sh.clear();
  const s = JSON.stringify(obj);
  const chunks = [];
  for (let i = 0; i < s.length; i += 40000) chunks.push([s.slice(i, i + 40000)]);
  sh.getRange(1, 1, chunks.length, 1).setValues(chunks);
}

function newsForApi_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('News');
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, Math.min(sh.getLastRow() - 1, 300), NEWS_HEADERS.length).getValues().map(r => ({
    published: new Date(r[0]).toISOString(), source: r[1], title: r[2], link: r[3], category: r[4],
    tickers: r[5] ? String(r[5]).split(',') : [], sectors: r[6] ? String(r[6]).split(',') : [], sentiment: Number(r[7]) || 0,
    roundup: !!classify_(String(r[2])).roundup,
  }));
}

// GET ?token=...  -> latest payload. Set Script Property API_TOKEN first (Project Settings > Script Properties).
// Deploy: Deploy > New deployment > Web app, execute as Me, access Anyone. The token is the only gate.
function doGet(e) {
  const token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!token || !e || !e.parameter || e.parameter.token !== token) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'unauthorized' })).setMimeType(ContentService.MimeType.JSON);
  }
  const sh = SpreadsheetApp.getActive().getSheetByName('_state');
  const text = sh && sh.getLastRow() ? sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => r[0]).join('') : '{"error":"run the screener first"}';
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function refreshNewsUi_() {
  const n = fetchNews();
  SpreadsheetApp.getActive().toast(n + ' new headlines.');
}

// ---------- triggers & digest ----------

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['runScreenerScheduled', 'fetchNews'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  // IDX closes 16:00 WIB; GOOGLEFINANCE lags, so run the screener at ~17:00.
  ScriptApp.newTrigger('runScreenerScheduled').timeBased().everyDays(1).atHour(17).create();
  ScriptApp.newTrigger('fetchNews').timeBased().everyHours(2).create();
  SpreadsheetApp.getActive().toast('Triggers installed: news every 2h, screener daily ~17:00 WIB.');
}

function runScreenerScheduled() {
  const dow = Number(Utilities.formatDate(new Date(), 'Asia/Jakarta', 'u')); // 1=Mon..7=Sun
  if (dow >= 6) return;
  fetchNews();
  runScreener();
}

// Optional: set Script Properties TG_TOKEN and TG_CHAT to get the top picks on Telegram.
function sendDigest_(picks, cfg, stamp) {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('TG_TOKEN'), chat = p.getProperty('TG_CHAT');
  if (!token || !chat || !picks.length) return;
  const top = picks.filter(x => x.action === 'ACT').slice(0, cfg.topN);
  const lines = top.map((x, i) => (i + 1) + '. ' + x.ticker + ' [' + x.score + '] ' + x.setup + ' | in ' +
    Math.round(x.entry) + ' stop ' + Math.round(x.stop) + ' tgt ' + Math.round(x.target) +
    (x.headlines[0] ? '\n   ' + x.headlines[0].title + '\n   ' + x.headlines[0].link : ''));
  const text = 'IDX swing picks ' + stamp + '\n' + (lines.length ? lines.join('\n') : 'No ACT picks today.') +
    '\nNot financial advice.';
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: chat, text: text }),
  });
}
