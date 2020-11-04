import { IShapeDocument } from '../../models/definitions/Automations';
import { sendRequest } from '../actions/utils';
import messageBroker from '../../messageBroker';

const erkhetPostData = async (shape: IShapeDocument, data: any) => {
  let billType = 1;
  let customerCode = '';

  const companyIds = await messageBroker().sendRPCMessage('rpc_queue:erxes-automations', {
    action: 'get-saved-conformities',
    payload: JSON.stringify({ mainType: 'deal', mainTypeId: data.deal._id, relTypes: ['company'] }),
  });

  if (companyIds.length > 0) {
    const companies = await messageBroker().sendRPCMessage('rpc_queue:erxes-automations', {
      action: 'get-companies',
      payload: JSON.stringify({ _id: { $in: companyIds } }),
    });

    for (const company of companies) {
      const re = new RegExp('(^[А-ЯЁӨҮ]{2}[0-9]{8}$)|(^\\d{7}$)', 'gui');
      if (re.test(company.code)) {
        const checkCompanyRes = await sendRequest({
          url: shape.config.checkCompanyUrl,
          method: 'GET',
          params: { ttd: company.code },
        });
        if (checkCompanyRes.found) {
          billType = 3;
          customerCode = company.code;
          continue;
        }
      }
    }
  }

  if (billType === 1) {
    const customerIds = await messageBroker().sendRPCMessage('rpc_queue:erxes-automations', {
      action: 'get-saved-conformities',
      payload: JSON.stringify({ mainType: 'deal', mainTypeId: data.deal._id, relTypes: ['customer'] }),
    });

    if (customerIds.length > 0) {
      const customers = await messageBroker().sendRPCMessage('rpc_queue:erxes-automations', {
        action: 'get-customers',
        payload: JSON.stringify({ _id: { $in: customerIds } }),
      });
      customerCode = customers.length > 0 ? customers[0].code : '' || '';
    }
  }

  const productsIds = data.deal.productsData.map(item => item.productId);
  const products = await messageBroker().sendRPCMessage('rpc_queue:erxes-automations', {
    action: 'get-products',
    payload: JSON.stringify({ _id: { $in: productsIds } }),
  });

  const productCodeById = {};
  for (const product of products) {
    productCodeById[product._id] = product.code;
  }

  const assignUserIds = data.deal.productsData.filter(item => item.assignUserId).map(item => item.assignUserId);
  const assignUsers = await messageBroker().sendRPCMessage('rpc_queue:erxes-automations', {
    action: 'get-users',
    payload: JSON.stringify({ _id: { $in: assignUserIds } }),
  });

  const userEmailById = {};
  for (const user of assignUsers) {
    userEmailById[user._id] = user.email;
  }

  const details = [];
  for (const productData of data.deal.productsData) {
    // not tickUsed product not sent
    if (!productData.tickUsed) {
      continue;
    }

    // if wrong productId then not sent
    if (!productCodeById[productData.productId]) {
      continue;
    }

    details.push({
      count: productData.quantity,
      amount: productData.amount,
      discount: productData.discount,
      inventoryCode: productCodeById[productData.productId],
      workerEmail: productData.assignUserId && userEmailById[productData.assignUserId],
    });
  }

  // debit payments coll
  const payments = {};
  const configure = {
    prepay: 'preAmount',
    cash: 'cashAmount',
    bank: 'mobileAmount',
    pos: 'cardAmount',
    wallet: 'debtAmount',
    barter: 'debtBarterAmount',
    after: 'debtAmount',
    other: 'debtAmount',
  };

  let sumSaleAmount = details.reduce((predet, detail) => {
    return { amount: predet.amount + detail.amount };
  }).amount;

  for (const paymentKind of Object.keys(data.deal.paymentsData || [])) {
    const payment = data.deal.paymentsData[paymentKind];
    payments[configure[paymentKind]] = (payments[configure[paymentKind]] || 0) + payment.amount;
    sumSaleAmount = sumSaleAmount - payment.amount;
  }

  // if payments is less sum sale amount then create debt
  if (sumSaleAmount > 0.005) {
    payments[shape.config.defaultPay] = (payments[shape.config.defaultPay] || 0) + sumSaleAmount;
  }

  const orderInfos = [
    {
      date: new Date().toISOString().slice(0, 10),
      orderId: data.deal._id,
      hasVat: shape.config.hasVat || false,
      hasCitytax: shape.config.hasCitytax || false,
      billType,
      customerCode,
      description: data.deal.name,
      details,
      ...payments,
    },
  ];

  const postData = {
    userEmail: shape.config.userEmail,
    token: shape.config.apiToken,
    apiKey: shape.config.apiKey,
    apiSecret: shape.config.apiSecret,
    orderInfos: JSON.stringify(orderInfos),
  };

  return messageBroker().sendRPCMessage('rpc_queue:erxes-automation-erkhet', {
    action: 'get-response-send-order-info',
    payload: JSON.stringify(postData),
  });
};

export default erkhetPostData;
