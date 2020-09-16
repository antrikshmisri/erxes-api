import { Customers, Conformities, Cars, CarCategories, Deals } from '../../../db/models';
import { sendEmail } from '../../utils';
import { ICustomerDocument } from '../../../db/models/definitions/customers';
import { ICarDocument } from '../../../db/models/definitions/cars';

const sendError = message => ({
  status: 'error',
  errorMessage: message,
});

const sendSuccess = data => ({
  status: 'success',
  data,
});

/*
 * MobileBackend
 */
export const receiveMobileBackend = async msg => {
  const { action, data } = msg;
  let customer: ICustomerDocument | null = null;

  switch (action) {
    case 'createCustomer':
      customer = await Customers.getWidgetCustomer({
        email: data.email,
        phone: data.phoneNumber,
      });

      const doc = {
        email: data.email,
        phone: data.phoneNumber,
        deviceToken: data.deviceToken,
        integrationId: 'MobileBend'
      };

      customer = customer
        ? await Customers.updateMessengerCustomer({ _id: customer._id, doc })
        : await Customers.createMessengerCustomer({ doc });

      return sendSuccess(customer);

    case 'sendEmail':
      return sendSuccess(await sendEmail({
        toEmails: [data.email],
        title: data.title,
        template: {
          name: data.title,
          data: {
            content: data.newPassword,
          },
        }
      }));

    case 'updateCar':
      return sendSuccess(await Cars.updateCar(data._id, {...data}));

    case 'removeCars':
      return sendSuccess(await Cars.removeCars(data.carIds))
  }
};

export const receiveRPCMobileBackend = async msg => {
  const { action, data } = msg;
  let customer: ICustomerDocument | null = null;
  let filter: any = {}
  let car: ICarDocument | null = null;

  switch (action) {
    case 'createCar':
      try{
        car = await Cars.createCar({...data});
        customer = await Customers.getWidgetCustomer({ email: data.user.email, phone: data.user.phoneNumber });
        if (!customer) {
          customer = await Customers.createMessengerCustomer({doc: {
            email: data.user.email,
            phone: data.user.phoneNumber,
            deviceToken: data.deviceToken,
            integrationId: 'MobileBend'
          }});
        }
        await Conformities.addConformity({mainType: 'customer', mainTypeId: customer._id, relType: 'car', relTypeId: car._id});
      } catch (e) {
        return sendError(e.message)
      }

      return sendSuccess(car);

    case 'filterCars':
      customer = await Customers.getWidgetCustomer({ email: data.user.email, phone: data.user.phoneNumber });

      if (!customer) {
        return sendError('User has not customer')
      }
      const carIds = await Conformities.savedConformity({mainType: 'customer', mainTypeId: customer._id, relTypes: ['car'] })

      filter = {};

      if (data.ids) {
        filter._id = {$in: data.ids}
      }

      if (data.searchValue){
        filter.searchText = { $in: [new RegExp(`.*${data.searchValue}.*`, 'i')] }
      }

      if (data.categoryId) {
        filter.categoryId = data.categoryId
      }


      return sendSuccess(await Cars.find({$and: [{_id: { $in: carIds }}, filter]}));

    case 'getCar':
      car = await Cars.findOne({ _id: data._id });

      if (!car) {
        return sendError('Car not found')
      }

      const dealIds = await Conformities.savedConformity({mainType: 'car', mainTypeId: car._id, relTypes: ['deal']});
      const deals = await Deals.find({_id: { $in: dealIds }});

      return sendSuccess({car, dealsOfCar: deals});

    case 'filterCarCategories':
      filter = {}
      if (data.parentId) {
        filter.parentId = data.parentId;
      }

      if (data.searchValue) {
        filter.name = new RegExp(`.*${data.searchValue}.*`, 'i');
      }

      return sendSuccess(await CarCategories.find(filter).sort({ order: 1 }));
  }
}
