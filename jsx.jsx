// client/src/components/HeroSection.js
import React from 'react';

const HeroSection = () => {
  return (
    <section className="hero-bg pt-32 pb-20 px-4">
      <div className="container mx-auto text-center animate-fade-in">
        <h1 className="text-4xl md:text-6xl font-bold text-gray-800 mb-6">
          Liberia Business Awards 3.0
        </h1>
        <p className="text-xl md:text-2xl text-gray-700 mb-10 max-w-3xl mx-auto">
          Recognizing Local Excellence, Celebrating National Impact.
        </p>
        {/* ... rest of hero section */}
      </div>
    </section>
  );
};

export default HeroSection;