const express = require("express");

const router = express.Router();

const NOVA_POSHTA_API_URL = "https://api.novaposhta.ua/v2.0/json/";
const NOVA_POSHTA_API_KEY =
  process.env.NOVA_POSHTA_API_KEY || "c21832386bc9bfa724d114721295a7f2";
let SENDER_CONFIG_CACHE = null;

/** Дата відправлення для API НП: лише день у форматі DD.MM.YYYY, часовий пояс України (інакше NP повертає "DateTime cannot be less then now"). */
function formatNovaPoshtaShipmentDate() {
  const s = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Kyiv" });
  const datePart = s.split(" ")[0];
  const [y, m, d] = datePart.split("-");
  return `${d}.${m}.${y}`;
}

async function callNovaPoshta(modelName, calledMethod, methodProperties = {}) {
  const res = await fetch(NOVA_POSHTA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      apiKey: NOVA_POSHTA_API_KEY,
      modelName,
      calledMethod,
      methodProperties
    })
  });

  if (!res.ok) {
    throw new Error("Помилка підключення до API Нової Пошти");
  }

  const data = await res.json();
  if (!data.success) {
    const msg = data.errors?.[0] || data.warnings?.[0] || "Помилка API Нової Пошти";
    throw new Error(msg);
  }

  return data.data || [];
}

function deliveryTypeToServiceType(type) {
  if (type === "address") return "WarehouseDoors";
  return "WarehouseWarehouse";
}

async function resolveSenderConfig() {
  if (SENDER_CONFIG_CACHE) return SENDER_CONFIG_CACHE;

  const envSenderRef = String(process.env.NOVA_POSHTA_SENDER_REF || "").trim();
  const envSenderAddressRef = String(process.env.NOVA_POSHTA_SENDER_ADDRESS_REF || "").trim();
  const envSenderContactRef = String(process.env.NOVA_POSHTA_SENDER_CONTACT_REF || "").trim();
  const envSenderPhone = String(process.env.NOVA_POSHTA_SENDER_PHONE || "").trim();
  const envSenderCityRef = String(process.env.NOVA_POSHTA_SENDER_CITY_REF || "").trim();

  // If everything is configured explicitly, prefer env values.
  if (envSenderRef && envSenderAddressRef && envSenderContactRef && envSenderPhone && envSenderCityRef) {
    SENDER_CONFIG_CACHE = {
      senderRef: envSenderRef,
      senderAddressRef: envSenderAddressRef,
      senderContactRef: envSenderContactRef,
      senderPhone: envSenderPhone,
      senderCityRef: envSenderCityRef
    };
    return SENDER_CONFIG_CACHE;
  }

  const counterparties = await callNovaPoshta("Counterparty", "getCounterparties", {
    CounterpartyProperty: "Sender",
    Page: 1
  });
  const sender = counterparties[0] || {};
  const senderRef = envSenderRef || sender.Ref || "";

  if (!senderRef) {
    throw new Error("Не вдалося автоматично знайти відправника (Sender Ref)");
  }

  const senderAddresses = await callNovaPoshta("Counterparty", "getCounterpartyAddresses", {
    Ref: senderRef,
    CounterpartyProperty: "Sender"
  });
  const senderAddress = senderAddresses[0] || {};
  const senderAddressRef = envSenderAddressRef || senderAddress.Ref || "";
  const senderCityRef = envSenderCityRef || senderAddress.CityRef || senderAddress.MainDescription || "";

  if (!senderAddressRef) {
    throw new Error("Не вдалося автоматично знайти адресу відправника");
  }

  const senderContacts = await callNovaPoshta("Counterparty", "getCounterpartyContactPersons", {
    Ref: senderRef,
    Page: 1
  });
  const senderContact = senderContacts[0] || {};
  const senderContactRef = envSenderContactRef || senderContact.Ref || "";
  const senderPhone =
    envSenderPhone ||
    String(senderContact.Phones || "").split(",")[0].trim() ||
    String(sender.Phone || "").trim();

  if (!senderContactRef) {
    throw new Error("Не вдалося автоматично знайти контакт відправника");
  }
  if (!senderCityRef) {
    throw new Error("Не вдалося автоматично знайти місто відправника");
  }
  if (!senderPhone || senderPhone.length < 10) {
    throw new Error("Не вдалося автоматично знайти телефон відправника");
  }

  SENDER_CONFIG_CACHE = {
    senderRef,
    senderAddressRef,
    senderContactRef,
    senderPhone,
    senderCityRef
  };
  return SENDER_CONFIG_CACHE;
}

router.get("/nova-poshta/cities", async (req, res) => {
  try {
    const query = String(req.query.query || "").trim();
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const data = await callNovaPoshta("Address", "searchSettlements", {
      CityName: query,
      Limit: 20
    });

    const addresses = data[0]?.Addresses || [];
    return res.json(addresses);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Не вдалося завантажити міста" });
  }
});

router.get("/nova-poshta/warehouses", async (req, res) => {
  try {
    const cityRef = String(req.query.cityRef || "").trim();
    if (!cityRef) {
      return res.status(400).json({ error: "Не передано місто" });
    }

    const data = await callNovaPoshta("AddressGeneral", "getWarehouses", { CityRef: cityRef });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Не вдалося завантажити відділення" });
  }
});

router.post("/nova-poshta/create-ttn", async (req, res) => {
  try {
    const {
      recipientName,
      recipientLastName,
      recipientMiddleName,
      recipientPhone,
      cityRef,
      warehouseRef,
      address,
      deliveryType,
      paymentMethod,
      orderNumber,
      cost,
      cargoDescription
    } = req.body || {};

    if (!recipientName || !recipientLastName || !recipientPhone || !cityRef) {
      return res.status(400).json({ error: "Не вистачає даних отримувача" });
    }

    const { senderRef, senderAddressRef, senderContactRef, senderPhone, senderCityRef } = await resolveSenderConfig();

    const recipientCounterparty = await callNovaPoshta("Counterparty", "save", {
      FirstName: recipientName,
      LastName: recipientLastName,
      MiddleName: String(recipientMiddleName || "").trim(),
      Phone: recipientPhone,
      CounterpartyType: "PrivatePerson",
      CounterpartyProperty: "Recipient"
    });

    const recipientRef = recipientCounterparty[0]?.Ref;
    if (!recipientRef) {
      throw new Error("Не вдалося створити отримувача в Новій Пошті");
    }

    const contacts = await callNovaPoshta("Counterparty", "getCounterpartyContactPersons", {
      Ref: recipientRef,
      Page: 1
    });
    const recipientContactRef = contacts[0]?.Ref;
    const recipientFullName = contacts[0]?.Description;

    if (!recipientContactRef) {
      throw new Error("Не вдалося отримати контакт отримувача");
    }

    const docPayload = {
      PayerType: "Recipient",
      PaymentMethod: "Cash",
      DateTime: formatNovaPoshtaShipmentDate(),
      CargoType: "Cargo",
      Weight: "0.5",
      ServiceType: deliveryTypeToServiceType(deliveryType),
      SeatsAmount: "1",
      Description: `Замовлення ${String(orderNumber || "").trim() || "EVRYKA"}`.slice(0, 35),
      Cost: String(Math.max(1, Number(cost || 0))),
      CitySender: senderCityRef,
      Sender: senderRef,
      SenderAddress: senderAddressRef,
      ContactSender: senderContactRef,
      SendersPhone: senderPhone,
      CityRecipient: cityRef,
      Recipient: recipientRef,
      ContactRecipient: recipientContactRef,
      RecipientsPhone: recipientPhone,
      RecipientContactName: recipientFullName
    };

    // Default package dimensions for every order.
    docPayload.OptionsSeat = [
      {
        volumetricWidth: "24",
        volumetricLength: "20",
        volumetricHeight: "16",
        weight: "0.5"
      }
    ];

    // Для оплати при отриманні ставимо саме контроль оплати на суму замовлення.
    if (String(paymentMethod || "cod").trim().toLowerCase() === "cod") {
      docPayload.AfterpaymentOnGoodsCost = String(Math.max(1, Number(cost || 0)));
    }

    if (deliveryType === "address") {
      docPayload.RecipientAddressName = address || "";
    } else {
      docPayload.RecipientAddress = warehouseRef;
    }

    const created = await callNovaPoshta("InternetDocument", "save", docPayload);
    const ttn = created[0]?.IntDocNumber;
    if (!ttn) {
      throw new Error("ТТН не була створена");
    }

    return res.json({
      ttn,
      ref: created[0]?.Ref || ""
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Не вдалося створити ТТН" });
  }
});

router.get("/nova-poshta/track-ttn", async (req, res) => {
  try {
    const ttn = String(req.query.ttn || "").trim();
    if (!ttn) {
      return res.status(400).json({ error: "Не передано ТТН" });
    }

    const data = await callNovaPoshta("TrackingDocument", "getStatusDocuments", {
      Documents: [{ DocumentNumber: ttn, Phone: "" }]
    });
    const doc = data[0] || {};

    return res.json({
      ttn,
      status: String(doc.Status || "").trim(),
      statusCode: String(doc.StatusCode || "").trim(),
      warehouseRecipient: String(doc.WarehouseRecipient || "").trim(),
      warehouseSender: String(doc.WarehouseSender || "").trim(),
      dateReceived: String(doc.DateReceived || "").trim(),
      actualDeliveryDate: String(doc.ActualDeliveryDate || "").trim(),
      scheduledDeliveryDate: String(doc.ScheduledDeliveryDate || "").trim()
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Не вдалося отримати статус ТТН" });
  }
});

module.exports = router;
