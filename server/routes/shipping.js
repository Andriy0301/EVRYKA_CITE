const express = require("express");

const router = express.Router();

const NOVA_POSHTA_API_URL = "https://api.novaposhta.ua/v2.0/json/";
const NOVA_POSHTA_API_KEY =
  process.env.NOVA_POSHTA_API_KEY || "c21832386bc9bfa724d114721295a7f2";

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

function deliveryTypeToWarehouseCategory(type) {
  if (type === "postomat") return "Postomat";
  if (type === "warehouse") return "Branch";
  return null;
}

function deliveryTypeToServiceType(type) {
  if (type === "address") return "WarehouseDoors";
  return "WarehouseWarehouse";
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
    const type = String(req.query.type || "warehouse").trim();
    if (!cityRef) {
      return res.status(400).json({ error: "Не передано місто" });
    }

    const category = deliveryTypeToWarehouseCategory(type);
    const methodProperties = { CityRef: cityRef };
    if (category) {
      methodProperties.CategoryOfWarehouse = category;
    }

    const data = await callNovaPoshta("AddressGeneral", "getWarehouses", methodProperties);
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
      recipientPhone,
      cityRef,
      warehouseRef,
      address,
      deliveryType,
      cost,
      cargoDescription
    } = req.body || {};

    if (!recipientName || !recipientLastName || !recipientPhone || !cityRef) {
      return res.status(400).json({ error: "Не вистачає даних отримувача" });
    }

    const senderRef = process.env.NOVA_POSHTA_SENDER_REF;
    const senderAddressRef = process.env.NOVA_POSHTA_SENDER_ADDRESS_REF;
    const senderContactRef = process.env.NOVA_POSHTA_SENDER_CONTACT_REF;
    const senderPhone = process.env.NOVA_POSHTA_SENDER_PHONE;

    if (!senderRef || !senderAddressRef || !senderContactRef || !senderPhone) {
      return res.status(500).json({
        error:
          "Для створення ТТН заповніть серверні змінні NOVA_POSHTA_SENDER_REF, NOVA_POSHTA_SENDER_ADDRESS_REF, NOVA_POSHTA_SENDER_CONTACT_REF, NOVA_POSHTA_SENDER_PHONE"
      });
    }

    const recipientCounterparty = await callNovaPoshta("Counterparty", "save", {
      FirstName: recipientName,
      LastName: recipientLastName,
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
      DateTime: new Date().toLocaleDateString("uk-UA"),
      CargoType: "Cargo",
      Weight: "0.5",
      ServiceType: deliveryTypeToServiceType(deliveryType),
      SeatsAmount: "1",
      Description: cargoDescription || "Товари EVRYKA",
      Cost: String(Math.max(1, Number(cost || 0))),
      CitySender: process.env.NOVA_POSHTA_SENDER_CITY_REF || "",
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

module.exports = router;
