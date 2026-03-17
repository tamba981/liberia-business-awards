// ============================================
// DATABASE SEED SCRIPT - INITIAL DATA
// ============================================
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '../.env.production' });

// Import models (assuming they're defined in server.js)
// For this script to work independently, we need to define models
// or require them from a separate file

// Simple seed function
async function seedDatabase() {
    try {
        console.log('🌱 Seeding database...');
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        console.log('✅ Connected to MongoDB');
        
        // Get models
        const Admin = mongoose.model('Admin', new mongoose.Schema({
            email: String,
            password: String,
            name: String,
            role: String,
            is_active: Boolean
        }));
        
        const BusinessUser = mongoose.model('BusinessUser', new mongoose.Schema({
            email: String,
            password: String,
            business_name: String,
            contact_name: String,
            phone: String,
            business_type: String,
            status: String
        }));
        
        const Category = mongoose.model('Category', new mongoose.Schema({
            name: String,
            slug: String,
            description: String,
            icon: String,
            color: String,
            display_order: Number,
            status: String
        }));
        
        // Clear existing data (optional)
        console.log('Clearing existing data...');
        await Admin.deleteMany({});
        await Category.deleteMany({});
        
        // Create default admin
        const adminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin123!', 12);
        const admin = await Admin.create({
            email: process.env.ADMIN_EMAIL || 'admin@liberiabusinessawardslr.com',
            password: adminPassword,
            name: 'System Administrator',
            role: 'super_admin',
            is_active: true
        });
        console.log('✅ Default admin created:', admin.email);
        
        // Create sample categories
        const categories = await Category.insertMany([
            {
                name: 'Technology',
                slug: 'technology',
                description: 'Innovation in technology and digital solutions',
                icon: 'fa-microchip',
                color: '#3B82F6',
                display_order: 1,
                status: 'active'
            },
            {
                name: 'Agriculture',
                slug: 'agriculture',
                description: 'Excellence in farming and agribusiness',
                icon: 'fa-seedling',
                color: '#10B981',
                display_order: 2,
                status: 'active'
            },
            {
                name: 'Manufacturing',
                slug: 'manufacturing',
                description: 'Outstanding manufacturing and production',
                icon: 'fa-industry',
                color: '#F59E0B',
                display_order: 3,
                status: 'active'
            },
            {
                name: 'Finance',
                slug: 'finance',
                description: 'Financial services and banking excellence',
                icon: 'fa-chart-line',
                color: '#8B5CF6',
                display_order: 4,
                status: 'active'
            },
            {
                name: 'Tourism',
                slug: 'tourism',
                description: 'Hospitality and tourism industry leaders',
                icon: 'fa-umbrella-beach',
                color: '#EC4899',
                display_order: 5,
                status: 'active'
            },
            {
                name: 'Healthcare',
                slug: 'healthcare',
                description: 'Medical and healthcare innovation',
                icon: 'fa-heartbeat',
                color: '#EF4444',
                display_order: 6,
                status: 'active'
            },
            {
                name: 'Education',
                slug: 'education',
                description: 'Educational institutions and services',
                icon: 'fa-graduation-cap',
                color: '#6366F1',
                display_order: 7,
                status: 'active'
            },
            {
                name: 'Energy',
                slug: 'energy',
                description: 'Energy and power sector excellence',
                icon: 'fa-bolt',
                color: '#F97316',
                display_order: 8,
                status: 'active'
            },
            {
                name: 'Construction',
                slug: 'construction',
                description: 'Building and construction industry',
                icon: 'fa-hard-hat',
                color: '#78716C',
                display_order: 9,
                status: 'active'
            },
            {
                name: 'Innovation',
                slug: 'innovation',
                description: 'Groundbreaking innovations and startups',
                icon: 'fa-lightbulb',
                color: '#FBBF24',
                display_order: 10,
                status: 'active'
            }
        ]);
        
        console.log(`✅ Created ${categories.length} categories`);
        
        console.log('\n📊 SEEDING COMPLETE');
        console.log('='.repeat(50));
        console.log('Admin Login:');
        console.log(`  Email: ${process.env.ADMIN_EMAIL || 'admin@liberiabusinessawardslr.com'}`);
        console.log(`  Password: ${process.env.ADMIN_PASSWORD || 'Admin123!'}`);
        console.log('='.repeat(50));
        
    } catch (error) {
        console.error('❌ Seeding error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run seed
seedDatabase();
