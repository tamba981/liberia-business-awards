// client/src/components/NominationForm.js
import React, { useState } from 'react';
import axios from 'axios';

const NominationForm = () => {
  const [formData, setFormData] = useState({
    businessName: '',
    contactPerson: '',
    email: '',
    phone: '',
    category: '',
    county: '',
    description: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/nominations', formData);
      alert('Nomination submitted successfully!');
      // Reset form or redirect
    } catch (err) {
      console.error(err.response.data);
      alert('Error submitting nomination');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      {/* Form fields */}
      <div className="mb-4">
        <label className="block text-gray-700 mb-2" htmlFor="businessName">
          Business Name
        </label>
        <input
          type="text"
          id="businessName"
          name="businessName"
          value={formData.businessName}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-lba-red"
          required
        />
      </div>
      {/* More form fields */}
      <button
        type="submit"
        className="bg-lba-red text-white px-6 py-3 rounded-full font-bold hover:bg-red-600 transition"
      >
        Submit Nomination
      </button>
    </form>
  );
};

export default NominationForm;