// GET /api/spotlight/categories-with-counts
router.get('/categories-with-counts', async (req, res) => {
  try {
    // Get all categories
    const categories = await Category.find({ status: 'active' }).sort('display_order');
    
    // Get story counts per category
    const storyCounts = await Story.aggregate([
      { $match: { status: 'published' } },
      { $group: { _id: '$category_id', count: { $sum: 1 } } }
    ]);
    
    // Create count map
    const countMap = {};
    storyCounts.forEach(item => {
      countMap[item._id] = item.count;
    });
    
    // Build response with counts
    const categoriesWithCounts = categories.map(cat => ({
      _id: cat._id,
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon,
      color: cat.color,
      count: countMap[cat._id] || 0
    }));
    
    // Add "All Stories" count
    const totalStories = await Story.countDocuments({ status: 'published' });
    
    res.json({
      success: true,
      categories: categoriesWithCounts,
      total: totalStories
    });
  } catch (error) {
    console.error('Error fetching categories with counts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
