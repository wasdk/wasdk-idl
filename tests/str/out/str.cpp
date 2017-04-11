#include <cstddef>
#include "str.h"

extern "C" {
  bool invokeCallback(void*, void*);
  void registerObject(void*, int);
  void unregisterObject(void*, int);
}

using namespace Str;
// Test class members

int Test::_typeid = 0;

Test::Test()
{
  registerObject(this, _typeid);
}

Test::~Test()
{
  unregisterObject(this, _typeid);
}

void Test::Destroy()
{
  delete this;
}

/* static */ bool Test::createAndFill(unsigned int size, unsigned char fill, unsigned int* result)
{
  return false;
}

/* static */ bool Test::destroy(unsigned int ptr)
{
  return false;
}

/* static */ bool Test::flip(const wasmbase::StringBox& s, wasmbase::StringBox* result)
{
  return false;
}
// end of Test class members
} // namespace Str