import React, { useState, useRef } from 'react';
const CUSTOMER_ID_MAX_LENGTH = 20;
interface CustomerFormErrors {
  customerId?: string;
  customerName?: string;
  [key: string]: string | undefined;
}
type CustomerDetailsProps = {
  customerId: string;
  customerName: string;
  onChange: (field: 'customerId' | 'customerName', value: string) => void;
  errors: CustomerFormErrors;                         
  setCustomerName: React.Dispatch<React.SetStateAction<string>>; 
  accountName?: string;
  accountNumber?: string;
  setAccountName?: React.Dispatch<React.SetStateAction<string>>; 
  setAccountNumber?: React.Dispatch<React.SetStateAction<string>>; 
};
const sanitizeMessage = (input: unknown): string => {
  if (typeof input !== 'string') return '';
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
};
const sanitizeInput = (value: string): string => {
  return value.replace(/[^a-zA-Z0-9\s\-]/g, '');
};
const maskAccountNumber = (value?: string): string => {
  if (!value) return '';
  if (value.length <= 4) return value;
  return '*'.repeat(value.length - 4) + value.slice(-4);
};
const CustomerDetails = ({
  customerId,
  customerName,
  onChange,
  errors,
  setCustomerName,
  accountName,
  accountNumber,
  setAccountName,
  setAccountNumber,
}: CustomerDetailsProps) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [customerNotFound, setCustomerNotFound] = useState('');
  const resetCustomerDetails = () => {
    setCustomerName('');
    if (typeof setAccountName === 'function') setAccountName('');
    if (typeof setAccountNumber === 'function') setAccountNumber('');
  };
  const handleCustomerIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeInput(e.target.value).slice(0, CUSTOMER_ID_MAX_LENGTH);
    onChange('customerId', sanitized);
    setCustomerNotFound('');
 
    if (sanitized.trim() === '') {
      resetCustomerDetails();
      return;
    }
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
    }, 600);
  };
  const handleCustomerNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeInput(e.target.value);
    onChange('customerName', sanitized);
  };
  const customerNameError = sanitizeMessage(errors.customerName);
  const safeCustomerNotFound = sanitizeMessage(customerNotFound);
 
  return (
    <div className="card pb-2.5">
      <div className="card-header p-2" id="CustomerDetails">
        <h3 className="card-title text-md md:text-lg">Customer Details</h3>
      </div>
 
      <div className="md:card-body p-2 grid gap-5">
        <div className="w-full">
          <div className="flex items-baseline flex-wrap lg:flex-nowrap">
            <label className="form-label flex items-center gap-1 max-w-40 text-sm md:text-md">
              Customer ID:<span className="text-danger text-xl">*</span>
            </label>
            <input
              className="input"
              type="text"
              placeholder="Enter the Customer ID"
              value={customerId}
              readOnly
              maxLength={CUSTOMER_ID_MAX_LENGTH} 
              onChange={handleCustomerIdChange}
            />
          </div>
          <div className="flex items-baseline flex-wrap lg:flex-nowrap">
            {safeCustomerNotFound && (
              <>
                <label className="form-label flex items-center gap-1 max-w-40 text-md" />
                <p className="text-danger text-xs mt-1">{safeCustomerNotFound}</p>
              </>
            )}
          </div>
        </div>
        <div className="w-full">
          <div className="flex items-baseline flex-wrap lg:flex-nowrap">
            <label className="form-label flex items-center gap-1 max-w-40 text-sm md:text-md">
              Customer Name:<span className="text-danger text-xl">*</span>
            </label>
            <input
              className="input"
              type="text"
              placeholder="Enter the Customer Name"
              value={customerName}
              onChange={handleCustomerNameChange} 
              readOnly
            />
          </div>
          <div className="flex items-baseline flex-wrap lg:flex-nowrap">
            <label className="form-label flex items-center gap-1 max-w-40 text-md" />
            {customerNameError && (
              <p className="text-danger text-xs mt-1">{customerNameError}</p>
            )}
          </div>
        </div>
        <div className="w-full">
          <div className="flex items-baseline flex-wrap lg:flex-nowrap">
            <label className="form-label flex items-center gap-1 max-w-40 text-sm md:text-md">
              Account Name:<span className="text-danger text-xl">*</span>
            </label>
            <input
              className="input"
              type="text"
              placeholder="Account Name"
              value={accountName ?? ''}
              readOnly
            />
          </div>
        </div>
        <div className="w-full">
          <div className="flex items-baseline flex-wrap lg:flex-nowrap">
            <label className="form-label flex items-center gap-1 max-w-40 text-sm md:text-md">
              Account Number:<span className="text-danger text-xl">*</span>
            </label>
            <input
              className="input"
              type="text"
              placeholder="Account Number"
              value={maskAccountNumber(accountNumber)}
              readOnly
            />
          </div>
        </div>
      </div>
    </div>
  );
};
 
export default CustomerDetails;
