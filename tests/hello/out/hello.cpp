#include <cstddef>
#include "hello.h"

extern "C" {
  bool invokeCallback(void*, void*);
  void registerObject(void*, int);
  void unregisterObject(void*, int);
}

using namespace Hello;
// Universe class members

int Universe::_typeid = 0;

Universe::Universe()
{
  registerObject(this, _typeid);
}

Universe::~Universe()
{
  unregisterObject(this, _typeid);
}

Universe* Universe::Create()
{
  return new Universe();
}

void Universe::Destroy()
{
  delete this;
}

bool Universe::giveAnswer(int* result)
{
  return false;
}
// end of Universe class members
} // namespace Hello